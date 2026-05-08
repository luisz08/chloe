import { describe, expect, test } from "bun:test";
import { planCompaction } from "./compactionPlanner.js";
import type { ChatMessage } from "./types.js";

// ─── helpers ────────────────────────────────────────────────────────────────

function textMsg(role: ChatMessage["role"], text: string): ChatMessage {
  return { role, content: [{ type: "text", text }] };
}

function toolUseMsg(id: string, name = "bash"): ChatMessage {
  return { role: "assistant", content: [{ type: "tool_use", id, name, input: {} }] };
}

function toolResultMsg(toolUseId: string, content = "ok"): ChatMessage {
  return { role: "user", content: [{ type: "tool_result", toolUseId, content }] };
}

const DEFAULT_INPUT = { keepRecentCount: 4, maxWorkingSetPaths: 24 };

// ─── recent window ────────────────────────────────────────────────────────────

describe("recent window", () => {
  test("last keepRecentCount messages are always pinned", () => {
    const messages = Array.from({ length: 10 }, (_, i) => textMsg("user", `msg ${i}`));
    const { pinnedIndices } = planCompaction({ messages, ...DEFAULT_INPUT });
    for (let i = 6; i < 10; i++) expect(pinnedIndices.has(i)).toBe(true);
  });

  test("messages before the recent window start as non-pinned (unless content-pinned)", () => {
    const messages = Array.from({ length: 10 }, (_, i) => textMsg("user", `msg ${i}`));
    const { pinnedIndices } = planCompaction({ messages, ...DEFAULT_INPUT });
    // indices 0–5 have plain text "msg N" — no path, no error, no patch
    for (let i = 0; i < 6; i++) expect(pinnedIndices.has(i)).toBe(false);
  });

  test("all messages pinned when count <= keepRecentCount", () => {
    const messages = [textMsg("user", "hi"), textMsg("assistant", "hello")];
    const { pinnedIndices } = planCompaction({ messages, ...DEFAULT_INPUT });
    expect(pinnedIndices.has(0)).toBe(true);
    expect(pinnedIndices.has(1)).toBe(true);
  });
});

// ─── content pins ─────────────────────────────────────────────────────────────

describe("content pins", () => {
  test("non-recent message referencing a working-set path is pinned", () => {
    // The recent 4 messages reference "src/foo.ts" → it enters the WorkingSet
    // An older message also mentions "src/foo.ts" → should be pinned
    const messages = [
      textMsg("user", "edit src/foo.ts please"), // idx 0 — old, mentions path
      textMsg("assistant", "filler 1"), // idx 1
      textMsg("user", "filler 2"), // idx 2
      textMsg("assistant", "filler 3"), // idx 3
      textMsg("user", "filler 4"), // idx 4
      textMsg("assistant", "look at src/foo.ts"), // idx 5 — recent
      textMsg("user", "filler 5"), // idx 6
      textMsg("assistant", "ok"), // idx 7
    ];
    const { pinnedIndices } = planCompaction({ messages, ...DEFAULT_INPUT });
    expect(pinnedIndices.has(0)).toBe(true);
  });

  test("non-recent message containing 'test failed' is pinned", () => {
    const messages = [
      textMsg("user", "test failed: assertion error"), // idx 0
      ...Array.from({ length: 7 }, (_, i) => textMsg("user", `filler ${i}`)),
    ];
    const { pinnedIndices } = planCompaction({ messages, ...DEFAULT_INPUT });
    expect(pinnedIndices.has(0)).toBe(true);
  });

  test("non-recent message containing 'panic' is pinned", () => {
    const messages = [
      textMsg("assistant", "thread 'main' panicked at src/main.rs"),
      ...Array.from({ length: 7 }, (_, i) => textMsg("user", `filler ${i}`)),
    ];
    const { pinnedIndices } = planCompaction({ messages, ...DEFAULT_INPUT });
    expect(pinnedIndices.has(0)).toBe(true);
  });

  test("non-recent message containing diff marker is pinned", () => {
    const messages = [
      textMsg("assistant", "diff --git a/src/foo.ts b/src/foo.ts"),
      ...Array.from({ length: 7 }, (_, i) => textMsg("user", `filler ${i}`)),
    ];
    const { pinnedIndices } = planCompaction({ messages, ...DEFAULT_INPUT });
    expect(pinnedIndices.has(0)).toBe(true);
  });

  test("non-recent message containing ```diff marker is pinned", () => {
    const messages = [
      textMsg("assistant", "here is the change:\n```diff\n+ new line\n```"),
      ...Array.from({ length: 7 }, (_, i) => textMsg("user", `filler ${i}`)),
    ];
    const { pinnedIndices } = planCompaction({ messages, ...DEFAULT_INPUT });
    expect(pinnedIndices.has(0)).toBe(true);
  });
});

// ─── index coverage ───────────────────────────────────────────────────────────

describe("index coverage", () => {
  test("pinnedIndices and summarizeIndices are disjoint", () => {
    const messages = Array.from({ length: 10 }, (_, i) => textMsg("user", `msg ${i}`));
    const { pinnedIndices, summarizeIndices } = planCompaction({ messages, ...DEFAULT_INPUT });
    for (const idx of summarizeIndices) {
      expect(pinnedIndices.has(idx)).toBe(false);
    }
  });

  test("pinnedIndices and summarizeIndices together cover every index", () => {
    const messages = Array.from({ length: 10 }, (_, i) => textMsg("user", `msg ${i}`));
    const { pinnedIndices, summarizeIndices } = planCompaction({ messages, ...DEFAULT_INPUT });
    const all = new Set([...pinnedIndices, ...summarizeIndices]);
    for (let i = 0; i < messages.length; i++) {
      expect(all.has(i)).toBe(true);
    }
    expect(all.size).toBe(messages.length);
  });

  test("empty message list produces empty plan", () => {
    const { pinnedIndices, summarizeIndices } = planCompaction({ messages: [], ...DEFAULT_INPUT });
    expect(pinnedIndices.size).toBe(0);
    expect(summarizeIndices).toHaveLength(0);
  });
});

// ─── workingSetPaths ──────────────────────────────────────────────────────────

describe("workingSetPaths", () => {
  test("returns paths found in recent messages", () => {
    const messages = [
      textMsg("user", "filler"),
      textMsg("user", "edited packages/core/src/foo.ts"),
      textMsg("user", "filler"),
      textMsg("user", "filler"),
    ];
    const { workingSetPaths } = planCompaction({ messages, ...DEFAULT_INPUT });
    expect(workingSetPaths).toContain("packages/core/src/foo.ts");
  });

  test("workingSetPaths length is capped at maxWorkingSetPaths", () => {
    const messages = Array.from({ length: 10 }, (_, i) =>
      textMsg("user", `see packages/core/src/file${i}.ts`),
    );
    const { workingSetPaths } = planCompaction({
      messages,
      keepRecentCount: 4,
      maxWorkingSetPaths: 3,
    });
    expect(workingSetPaths.length).toBeLessThanOrEqual(3);
  });
});

// ─── tool call pair enforcement (via planCompaction) ─────────────────────────

describe("tool call pair enforcement in planCompaction", () => {
  test("pinned tool_result pulls its tool_use into pinned even if old", () => {
    // idx 0: tool_use "t1"   (old — would normally be summarized)
    // idx 1: tool_result "t1" (recent — pinned by recent window)
    // idx 2,3,4: recent fillers
    const messages = [
      toolUseMsg("t1"),
      toolResultMsg("t1", "output"),
      textMsg("user", "filler a"),
      textMsg("user", "filler b"),
      textMsg("user", "filler c"),
    ];
    const { pinnedIndices } = planCompaction({
      messages,
      keepRecentCount: 4,
      maxWorkingSetPaths: 24,
    });
    // idx 1,2,3,4 are recent → pinned; tool_result at idx 1 needs tool_use at idx 0
    expect(pinnedIndices.has(0)).toBe(true);
  });

  test("orphaned tool_result (no matching tool_use) is removed from pinned", () => {
    // Only the tool_result exists; no tool_use in any message
    const messages = [
      toolResultMsg("ghost", "output"), // idx 0 — orphaned
      textMsg("user", "filler a"), // idx 1
      textMsg("user", "filler b"), // idx 2
      textMsg("user", "filler c"), // idx 3
      textMsg("user", "filler d"), // idx 4
    ];
    // With keepRecentCount=5, idx 0 enters the recent window → initially pinned
    // → pairing check finds no matching tool_use → removed from pinned
    const plan2 = planCompaction({ messages, keepRecentCount: 5, maxWorkingSetPaths: 24 });
    expect(plan2.pinnedIndices.has(0)).toBe(false);
  });
});
