import { describe, expect, test } from "bun:test";
import Anthropic from "@anthropic-ai/sdk";
import type { MessageParam } from "@anthropic-ai/sdk/resources/messages";
import { ContextTooLargeError, compressIfNeeded } from "./compressor.js";

function makeMessages(count: number): MessageParam[] {
  return Array.from({ length: count }, (_, i) => ({
    role: i % 2 === 0 ? ("user" as const) : ("assistant" as const),
    content: `Message ${i}`,
  }));
}

function makeMockClient(
  summaryText = "Summarized history",
  countTokensImpl?: () => Promise<{ input_tokens: number }>,
) {
  return {
    messages: {
      countTokens: countTokensImpl ?? (async () => ({ input_tokens: 0 })),
      create: async (_params: unknown) => ({
        content: [{ type: "text", text: summaryText }],
      }),
    },
  };
}

describe("compressIfNeeded", () => {
  test("T010: returns null when messages.length <= keepRecentCount (fast-path)", async () => {
    const client = makeMockClient();
    const messages = makeMessages(5);
    const result = await compressIfNeeded(messages as MessageParam[], {
      client: client as never,
      model: "claude-sonnet-4-6",
      fastModel: "claude-haiku-4-5",
      threshold: 0.75,
      keepRecentCount: 20,
    });
    expect(result).toBeNull();
  });

  test("T010: returns null when local token estimate is below threshold", async () => {
    // threshold=1.1 means limit*1.1=220k — short messages never reach that
    const messages = makeMessages(30);
    const client = makeMockClient();

    const result = await compressIfNeeded(messages as MessageParam[], {
      client: client as never,
      model: "claude-sonnet-4-6",
      fastModel: "claude-haiku-4-5",
      threshold: 1.1,
      keepRecentCount: 20,
    });

    expect(result).toBeNull();
  });

  test("T011: returns CompressResult when local token estimate exceeds threshold", async () => {
    // threshold=0 means limit*0=0 — any non-empty session triggers compression
    const messages = makeMessages(30);
    const client = makeMockClient("## Summary\nKey facts here");

    const result = await compressIfNeeded(messages as MessageParam[], {
      client: client as never,
      model: "claude-sonnet-4-6",
      fastModel: "claude-haiku-4-5",
      threshold: 0,
      keepRecentCount: 20,
    });

    expect(result).not.toBeNull();
    expect(result?.compressedCount).toBe(10); // 30 - 20
    expect(result?.keptCount).toBe(20);
    expect(result?.summaryText).toBe("## Summary\nKey facts here");
    // messages = [summary-user, summary-assistant, ...recent(20)]
    expect(result?.messages).toHaveLength(22);
    expect(result?.messages[0]?.role).toBe("user");
    expect(result?.messages[0]?.content).toContain("<context_summary>");
    expect(result?.messages[1]?.role).toBe("assistant");
    expect(result?.messages[1]?.content).toContain("Understood");
  });

  test("T011: compressedCount + keptCount sum equals total input messages", async () => {
    const messages = makeMessages(25);
    const client = makeMockClient("Summary");

    const result = await compressIfNeeded(messages as MessageParam[], {
      client: client as never,
      model: "claude-sonnet-4-6",
      fastModel: "claude-haiku-4-5",
      threshold: 0,
      keepRecentCount: 20,
    });
    expect(result?.compressedCount).toBe(5);
    expect(result?.keptCount).toBe(20);
  });

  test("extracts text from response when thinking block precedes text block", async () => {
    // Reasoning models (e.g. claude-opus-4-7) return thinking blocks before text blocks
    const messages = makeMessages(30);
    const client = {
      messages: {
        countTokens: async () => ({ input_tokens: 0 }),
        create: async (_params: unknown) => ({
          content: [
            { type: "thinking", thinking: "Let me summarize..." },
            { type: "text", text: "The actual summary" },
          ],
        }),
      },
    };

    const result = await compressIfNeeded(messages as MessageParam[], {
      client: client as never,
      model: "claude-sonnet-4-6",
      fastModel: "claude-opus-4-7",
      threshold: 0,
      keepRecentCount: 20,
    });

    expect(result?.summaryText).toBe("The actual summary");
  });

  test("ContextTooLargeError is an instance of Error with correct name", () => {
    const err = new ContextTooLargeError();
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("ContextTooLargeError");
    expect(err.message).toContain("too large");
  });

  test("uses API token count when countTokens succeeds", async () => {
    // API returns 160k > 75% of 200k → compression triggered
    const messages = makeMessages(30);
    const client = makeMockClient("API summary", async () => ({ input_tokens: 160_000 }));

    const result = await compressIfNeeded(messages as MessageParam[], {
      client: client as never,
      model: "claude-sonnet-4-6",
      fastModel: "claude-haiku-4-5",
      threshold: 0.75,
      keepRecentCount: 20,
    });

    expect(result).not.toBeNull();
    expect(result?.summaryText).toBe("API summary");
  });

  test("falls back to local estimate when countTokens returns 404", async () => {
    // NotFoundError → local estimate; threshold=0 forces compression via local path
    const messages = makeMessages(30);
    const client = makeMockClient("Fallback summary", async () => {
      throw new Anthropic.NotFoundError(404, {}, "Not found", {});
    });

    const result = await compressIfNeeded(messages as MessageParam[], {
      client: client as never,
      model: "claude-sonnet-4-6",
      fastModel: "claude-haiku-4-5",
      threshold: 0,
      keepRecentCount: 20,
    });

    expect(result).not.toBeNull();
    expect(result?.summaryText).toBe("Fallback summary");
  });

  test("falls back to local estimation when countTokens throws any error", async () => {
    const messages = makeMessages(30);
    const apiError = new Anthropic.InternalServerError(500, {}, "Server error", {});
    const client = makeMockClient("Fallback summary", async () => {
      throw apiError;
    });

    const result = await compressIfNeeded(messages as MessageParam[], {
      client: client as never,
      model: "claude-sonnet-4-6",
      fastModel: "claude-haiku-4-5",
      threshold: 0,
      keepRecentCount: 20,
    });
    expect(result).not.toBeNull();
    expect(result?.summaryText).toBe("Fallback summary");
  });

  test("threshold:0 always compresses (forceCompress pattern)", async () => {
    const messages = makeMessages(30);
    const client = makeMockClient("Force summary");

    const result = await compressIfNeeded(messages as MessageParam[], {
      client: client as never,
      model: "claude-sonnet-4-6",
      fastModel: "claude-haiku-4-5",
      threshold: 0,
      keepRecentCount: 20,
    });

    expect(result).not.toBeNull();
    expect(result?.compressedCount).toBe(10);
  });
});
