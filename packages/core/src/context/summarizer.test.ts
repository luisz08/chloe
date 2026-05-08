import { describe, expect, test } from "bun:test";
import { BadRequestError, InternalServerError, RateLimitError } from "@anthropic-ai/sdk";
import { buildSummaryRequest, summarizeWithRetry } from "./summarizer.js";
import type { ChatMessage } from "./types.js";

// ─── helpers ─────────────────────────────────────────────────────────────────

function textMsg(role: ChatMessage["role"], text: string): ChatMessage {
  return { role, content: [{ type: "text", text }] };
}

function toolUseMsg(id: string, name = "bash", input: unknown = {}): ChatMessage {
  return { role: "assistant", content: [{ type: "tool_use", id, name, input }] };
}

function toolResultMsg(toolUseId: string, content: string): ChatMessage {
  return { role: "user", content: [{ type: "tool_result", toolUseId, content }] };
}

const ALL_INDICES = (msgs: ChatMessage[]) => msgs.map((_, i) => i);

// ─── buildSummaryRequest ─────────────────────────────────────────────────────

describe("buildSummaryRequest", () => {
  test("returns a single user message", () => {
    const messages = [textMsg("user", "hello"), textMsg("assistant", "world")];
    const result = buildSummaryRequest({
      messages,
      summarizeIndices: ALL_INDICES(messages),
      wordLimit: 700,
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.role).toBe("user");
  });

  test("output is a text block containing flattened content", () => {
    const messages = [textMsg("user", "hello"), textMsg("assistant", "world")];
    const result = buildSummaryRequest({
      messages,
      summarizeIndices: ALL_INDICES(messages),
      wordLimit: 700,
    });
    const text = (result[0]?.content[0] as { type: string; text: string }).text;
    expect(text).toContain("USER:");
    expect(text).toContain("ASSISTANT:");
    expect(text).toContain("hello");
    expect(text).toContain("world");
  });

  test("includes tool_use block as ASSISTANT TOOL USE line", () => {
    const messages = [toolUseMsg("t1", "bash", { cmd: "ls" })];
    const result = buildSummaryRequest({ messages, summarizeIndices: [0], wordLimit: 700 });
    const text = (result[0]?.content[0] as { type: string; text: string }).text;
    expect(text).toContain("ASSISTANT TOOL USE bash");
    expect(text).toContain("ls");
  });

  test("includes tool_result block as TOOL RESULT line", () => {
    const messages = [toolResultMsg("t1", "file listing output")];
    const result = buildSummaryRequest({ messages, summarizeIndices: [0], wordLimit: 700 });
    const text = (result[0]?.content[0] as { type: string; text: string }).text;
    expect(text).toContain("TOOL RESULT");
    expect(text).toContain("file listing output");
  });

  test("only includes messages at summarizeIndices", () => {
    const messages = [
      textMsg("user", "SHOULD_APPEAR"),
      textMsg("assistant", "SHOULD_NOT_APPEAR"),
      textMsg("user", "SHOULD_APPEAR_2"),
    ];
    const result = buildSummaryRequest({ messages, summarizeIndices: [0, 2], wordLimit: 700 });
    const text = (result[0]?.content[0] as { type: string; text: string }).text;
    expect(text).toContain("SHOULD_APPEAR");
    expect(text).toContain("SHOULD_APPEAR_2");
    expect(text).not.toContain("SHOULD_NOT_APPEAR");
  });

  test("tool_result content is truncated when exceeding per-item limit (2400 chars)", () => {
    const longContent = "x".repeat(3000);
    const messages = [toolResultMsg("t1", longContent)];
    const result = buildSummaryRequest({ messages, summarizeIndices: [0], wordLimit: 700 });
    const text = (result[0]?.content[0] as { type: string; text: string }).text;
    // The original 3000-char content should be shortened
    expect(text.length).toBeLessThan(longContent.length + 200); // 200 for label overhead
  });

  test("total flattened string is capped at 24000 chars", () => {
    // 30 messages of 1000 chars each = 30k chars total
    const messages = Array.from({ length: 30 }, (_, i) =>
      textMsg("user", `${"y".repeat(1000)} msg${i}`),
    );
    const result = buildSummaryRequest({
      messages,
      summarizeIndices: ALL_INDICES(messages),
      wordLimit: 700,
    });
    const text = (result[0]?.content[0] as { type: string; text: string }).text;
    // Should be well under 30k chars (24k cap + instruction overhead)
    expect(text.length).toBeLessThan(25_000);
  });

  test("output contains the summary instruction", () => {
    const messages = [textMsg("user", "hello")];
    const result = buildSummaryRequest({ messages, summarizeIndices: [0], wordLimit: 500 });
    const text = (result[0]?.content[0] as { type: string; text: string }).text;
    expect(text).toContain("500 words");
  });

  test("empty summarizeIndices produces an instruction-only message", () => {
    const messages = [textMsg("user", "hello")];
    const result = buildSummaryRequest({ messages, summarizeIndices: [], wordLimit: 700 });
    expect(result).toHaveLength(1);
  });

  test("priorSummary is prepended when provided", () => {
    const messages = [textMsg("user", "hello")];
    const result = buildSummaryRequest({
      messages,
      summarizeIndices: [0],
      wordLimit: 700,
      priorSummary: "Previous context: user was working on login flow.",
    });
    const text = (result[0]?.content[0] as { type: string; text: string }).text;
    expect(text).toContain("Previous context: user was working on login flow.");
  });
});

// ─── summarizeWithRetry ──────────────────────────────────────────────────────

function makeMockClient(impl: () => Promise<{ content: Array<{ type: string; text?: string }> }>) {
  return {
    messages: { create: impl },
  };
}

describe("summarizeWithRetry", () => {
  test("returns text from successful response", async () => {
    const client = makeMockClient(async () => ({
      content: [{ type: "text", text: "nice summary" }],
    }));
    const messages: ChatMessage[] = [textMsg("user", "hello")];
    const result = await summarizeWithRetry(
      client as never,
      "claude-haiku-4-5",
      messages,
      1024,
      3,
      0,
    );
    expect(result).toBe("nice summary");
  });

  test("extracts text block even when thinking block precedes it", async () => {
    const client = makeMockClient(async () => ({
      content: [
        { type: "thinking", thinking: "Let me summarize..." },
        { type: "text", text: "the summary" },
      ],
    }));
    const messages: ChatMessage[] = [textMsg("user", "hello")];
    const result = await summarizeWithRetry(client as never, "model", messages, 1024, 3, 0);
    expect(result).toBe("the summary");
  });

  test("retries on RateLimitError and eventually succeeds", async () => {
    let attempts = 0;
    const client = makeMockClient(async () => {
      attempts++;
      if (attempts < 3) throw new RateLimitError(429, {}, "rate limit", {});
      return { content: [{ type: "text", text: "success after retries" }] };
    });
    const messages: ChatMessage[] = [textMsg("user", "hello")];
    const result = await summarizeWithRetry(client as never, "model", messages, 1024, 3, 0);
    expect(result).toBe("success after retries");
    expect(attempts).toBe(3);
  });

  test("retries on InternalServerError", async () => {
    let attempts = 0;
    const client = makeMockClient(async () => {
      attempts++;
      if (attempts < 2) throw new InternalServerError(500, {}, "server error", {});
      return { content: [{ type: "text", text: "ok" }] };
    });
    const result = await summarizeWithRetry(
      client as never,
      "model",
      [textMsg("user", "x")],
      1024,
      3,
      0,
    );
    expect(result).toBe("ok");
    expect(attempts).toBe(2);
  });

  test("does NOT retry on BadRequestError", async () => {
    let attempts = 0;
    const client = makeMockClient(async () => {
      attempts++;
      throw new BadRequestError(400, {}, "bad request", {});
    });
    const messages: ChatMessage[] = [textMsg("user", "hello")];
    await expect(
      summarizeWithRetry(client as never, "model", messages, 1024, 3, 0),
    ).rejects.toBeInstanceOf(BadRequestError);
    expect(attempts).toBe(1);
  });

  test("rethrows last error after max retries exhausted", async () => {
    let attempts = 0;
    const client = makeMockClient(async () => {
      attempts++;
      throw new RateLimitError(429, {}, "always rate limited", {});
    });
    const messages: ChatMessage[] = [textMsg("user", "hello")];
    await expect(
      summarizeWithRetry(client as never, "model", messages, 1024, 2, 0),
    ).rejects.toBeInstanceOf(RateLimitError);
    expect(attempts).toBe(3); // initial + 2 retries
  });
});
