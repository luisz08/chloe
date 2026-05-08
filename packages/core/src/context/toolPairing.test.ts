import { describe, expect, test } from "bun:test";
import { enforceToolCallPairs } from "./compactionPlanner.js";
import type { ChatMessage } from "./types.js";

function toolUseMsg(id: string): ChatMessage {
  return { role: "assistant", content: [{ type: "tool_use", id, name: "bash", input: {} }] };
}

function toolResultMsg(toolUseId: string): ChatMessage {
  return { role: "user", content: [{ type: "tool_result", toolUseId, content: "ok" }] };
}

function textMsg(text = "filler"): ChatMessage {
  return { role: "user", content: [{ type: "text", text }] };
}

describe("enforceToolCallPairs", () => {
  test("pinned tool_result adds its tool_use to pinned", () => {
    const messages = [
      toolUseMsg("t1"), // idx 0 — not pinned initially
      toolResultMsg("t1"), // idx 1 — pinned
    ];
    const pinned = new Set([1]);
    enforceToolCallPairs(messages, pinned);
    expect(pinned.has(0)).toBe(true);
  });

  test("pinned tool_use adds its tool_result to pinned", () => {
    const messages = [
      toolUseMsg("t1"), // idx 0 — pinned
      toolResultMsg("t1"), // idx 1 — not pinned initially
    ];
    const pinned = new Set([0]);
    enforceToolCallPairs(messages, pinned);
    expect(pinned.has(1)).toBe(true);
  });

  test("orphaned tool_result (no tool_use in messages) is removed from pinned", () => {
    const messages = [
      toolResultMsg("ghost"), // idx 0 — pinned but tool_use does not exist
    ];
    const pinned = new Set([0]);
    enforceToolCallPairs(messages, pinned);
    expect(pinned.has(0)).toBe(false);
  });

  test("orphaned tool_use (no tool_result in messages) is removed from pinned", () => {
    const messages = [
      toolUseMsg("ghost"), // idx 0 — pinned but tool_result does not exist
    ];
    const pinned = new Set([0]);
    enforceToolCallPairs(messages, pinned);
    expect(pinned.has(0)).toBe(false);
  });

  test("consistent pairs are unchanged", () => {
    const messages = [
      toolUseMsg("t1"), // idx 0
      toolResultMsg("t1"), // idx 1
    ];
    const pinned = new Set([0, 1]);
    enforceToolCallPairs(messages, pinned);
    expect(pinned.has(0)).toBe(true);
    expect(pinned.has(1)).toBe(true);
  });

  test("text-only messages are not affected", () => {
    const messages = [textMsg("filler a"), textMsg("filler b"), textMsg("filler c")];
    const pinned = new Set([0, 1]);
    enforceToolCallPairs(messages, pinned);
    expect(pinned.has(0)).toBe(true);
    expect(pinned.has(1)).toBe(true);
    expect(pinned.has(2)).toBe(false);
  });

  test("transitivity: two tool_uses in one message — both results are pulled in", () => {
    // assistant message with two tool_use blocks (both pinned)
    const multiTool: ChatMessage = {
      role: "assistant",
      content: [
        { type: "tool_use", id: "t1", name: "bash", input: {} },
        { type: "tool_use", id: "t2", name: "bash", input: {} },
      ],
    };
    const messages = [
      multiTool, // idx 0 — pinned
      toolResultMsg("t1"), // idx 1 — not pinned
      toolResultMsg("t2"), // idx 2 — not pinned
    ];
    const pinned = new Set([0]);
    enforceToolCallPairs(messages, pinned);
    expect(pinned.has(1)).toBe(true);
    expect(pinned.has(2)).toBe(true);
  });

  test("chain: tool_result pinned → tool_use pulled in → its sibling tool_result also pulled in", () => {
    // assistant with two tool_uses; only one result is initially pinned
    const multiTool: ChatMessage = {
      role: "assistant",
      content: [
        { type: "tool_use", id: "t1", name: "bash", input: {} },
        { type: "tool_use", id: "t2", name: "bash", input: {} },
      ],
    };
    const messages = [
      multiTool, // idx 0 — not pinned
      toolResultMsg("t1"), // idx 1 — pinned
      toolResultMsg("t2"), // idx 2 — not pinned
    ];
    const pinned = new Set([1]); // only t1's result is pinned
    enforceToolCallPairs(messages, pinned);
    // t1 result pinned → pulls in multiTool (idx 0)
    // multiTool pinned → contains t2 → pulls in t2's result (idx 2)
    expect(pinned.has(0)).toBe(true);
    expect(pinned.has(2)).toBe(true);
  });
});
