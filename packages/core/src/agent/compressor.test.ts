import { describe, expect, test } from "bun:test";
import type { MessageParam } from "@anthropic-ai/sdk/resources/messages";
import { ContextTooLargeError, compressIfNeeded } from "./compressor.js";

function makeMessages(count: number): MessageParam[] {
  return Array.from({ length: count }, (_, i) => ({
    role: i % 2 === 0 ? ("user" as const) : ("assistant" as const),
    content: `Message ${i}`,
  }));
}

function makeMockClient(tokenCount: number, summaryText = "Summarized history") {
  return {
    messages: {
      countTokens: async (_params: unknown) => ({ input_tokens: tokenCount }),
      create: async (_params: unknown) => ({
        content: [{ type: "text", text: summaryText }],
      }),
    },
  };
}

describe("compressIfNeeded", () => {
  test("T010: returns null when messages.length <= keepRecentCount (fast-path, no API call)", async () => {
    let countTokensCalled = false;
    const client = {
      messages: {
        countTokens: async () => {
          countTokensCalled = true;
          return { input_tokens: 999_999 };
        },
        create: async (_: unknown) => ({ content: [{ type: "text", text: "" }] }),
      },
    };

    const messages = makeMessages(5);
    const result = await compressIfNeeded(messages as MessageParam[], {
      client: client as never,
      model: "claude-sonnet-4-6",
      fastModel: "claude-haiku-4-5",
      threshold: 0.75,
      keepRecentCount: 20,
    });

    expect(result).toBeNull();
    expect(countTokensCalled).toBe(false);
  });

  test("T010: returns null when token count is below threshold", async () => {
    const messages = makeMessages(30);
    const client = makeMockClient(100_000); // well below 75% of 200k = 150k

    const result = await compressIfNeeded(messages as MessageParam[], {
      client: client as never,
      model: "claude-sonnet-4-6",
      fastModel: "claude-haiku-4-5",
      threshold: 0.75,
      keepRecentCount: 20,
    });

    expect(result).toBeNull();
  });

  test("T011: returns CompressResult when token count exceeds threshold", async () => {
    const messages = makeMessages(30); // 30 > keepRecentCount=20
    const client = makeMockClient(160_000, "## Summary\nKey facts here"); // 160k > 75% of 200k

    const result = await compressIfNeeded(messages as MessageParam[], {
      client: client as never,
      model: "claude-sonnet-4-6",
      fastModel: "claude-haiku-4-5",
      threshold: 0.75,
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
    const shortMessages = makeMessages(25);
    const bigClient = makeMockClient(999_000, "Summary");

    // With threshold=0.75 and 160k tokens: compress
    // Verify structure is correct
    const result = await compressIfNeeded(shortMessages as MessageParam[], {
      client: bigClient as never,
      model: "claude-sonnet-4-6",
      fastModel: "claude-haiku-4-5",
      threshold: 0.75,
      keepRecentCount: 20,
    });
    expect(result?.compressedCount).toBe(5);
    expect(result?.keptCount).toBe(20);
  });

  test("ContextTooLargeError is an instance of Error with correct name", () => {
    const err = new ContextTooLargeError();
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("ContextTooLargeError");
    expect(err.message).toContain("too large");
  });

  test("threshold:0 always compresses (forceCompress pattern)", async () => {
    const messages = makeMessages(30);
    const client = makeMockClient(1, "Force summary"); // very low token count

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
