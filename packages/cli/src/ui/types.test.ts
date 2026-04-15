import { describe, expect, it } from "bun:test";
import type { ChatMessage, TokenUsage } from "./types.js";
import { getContextLimit } from "./types.js";

describe("getContextLimit", () => {
  it("returns 200_000 for claude-sonnet-4-6", () => {
    expect(getContextLimit("claude-sonnet-4-6")).toBe(200_000);
  });

  it("returns 200_000 for claude-opus-4-6", () => {
    expect(getContextLimit("claude-opus-4-6")).toBe(200_000);
  });

  it("returns 200_000 for claude-haiku-4-5", () => {
    expect(getContextLimit("claude-haiku-4-5")).toBe(200_000);
  });

  it("returns 200_000 for unknown models (fallback)", () => {
    expect(getContextLimit("unknown-model")).toBe(200_000);
    expect(getContextLimit("gpt-4")).toBe(200_000);
    expect(getContextLimit("")).toBe(200_000);
  });

  it("prefix-matches model names with version suffixes", () => {
    expect(getContextLimit("claude-sonnet-4-6-20251001")).toBe(200_000);
  });
});

describe("TokenUsage accumulation", () => {
  function accumulate(prev: TokenUsage, next: TokenUsage): TokenUsage {
    return {
      inputTokens: prev.inputTokens + next.inputTokens,
      outputTokens: prev.outputTokens + next.outputTokens,
      cacheReadTokens: prev.cacheReadTokens + next.cacheReadTokens,
      cacheCreationTokens: prev.cacheCreationTokens + next.cacheCreationTokens,
    };
  }

  const zero: TokenUsage = {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
  };

  it("accumulates tokens across turns", () => {
    const turn1: TokenUsage = {
      inputTokens: 100,
      outputTokens: 50,
      cacheReadTokens: 0,
      cacheCreationTokens: 200,
    };
    const turn2: TokenUsage = {
      inputTokens: 150,
      outputTokens: 80,
      cacheReadTokens: 200,
      cacheCreationTokens: 0,
    };

    const after1 = accumulate(zero, turn1);
    expect(after1.inputTokens).toBe(100);
    expect(after1.outputTokens).toBe(50);
    expect(after1.cacheCreationTokens).toBe(200);

    const after2 = accumulate(after1, turn2);
    expect(after2.inputTokens).toBe(250);
    expect(after2.outputTokens).toBe(130);
    expect(after2.cacheReadTokens).toBe(200);
    expect(after2.cacheCreationTokens).toBe(200);
  });

  it("starts at zero", () => {
    expect(zero.inputTokens).toBe(0);
    expect(zero.outputTokens).toBe(0);
    expect(zero.cacheReadTokens).toBe(0);
    expect(zero.cacheCreationTokens).toBe(0);
  });
});

describe("ChatMessage state transitions", () => {
  function makeToolMsg(state: ChatMessage["state"]): ChatMessage {
    return { id: "t1", role: "tool", content: "", toolName: "bash", state };
  }

  it("pending → confirmed transition", () => {
    const msg = makeToolMsg("pending");
    const confirmed = { ...msg, state: "confirmed" as const };
    expect(confirmed.state).toBe("confirmed");
    expect(confirmed.id).toBe(msg.id);
  });

  it("pending → denied transition", () => {
    const msg = makeToolMsg("pending");
    const denied = { ...msg, state: "denied" as const };
    expect(denied.state).toBe("denied");
  });

  it("confirmed → done transition (after tool result arrives)", () => {
    const msg = makeToolMsg("confirmed");
    const done = { ...msg, state: "done" as const, toolOutput: "exit code 0" };
    expect(done.state).toBe("done");
    expect(done.toolOutput).toBe("exit code 0");
  });

  it("assistant message streaming → complete transition", () => {
    const streaming: ChatMessage = {
      id: "a1",
      role: "assistant",
      content: "partial",
      state: "streaming",
    };
    const complete = { ...streaming, content: "full response", state: "complete" as const };
    expect(complete.state).toBe("complete");
    expect(complete.content).toBe("full response");
  });
});
