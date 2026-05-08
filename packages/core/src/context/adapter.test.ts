import { describe, expect, test } from "bun:test";
import type { MessageParam } from "@anthropic-ai/sdk/resources/messages";
import { toChatMessages, toMessageParams } from "./adapter.js";

describe("toChatMessages", () => {
  test("converts string content to a single text block", () => {
    const params: MessageParam[] = [{ role: "user", content: "hello" }];
    const result = toChatMessages(params);
    expect(result).toHaveLength(1);
    expect(result[0]?.role).toBe("user");
    expect(result[0]?.content).toEqual([{ type: "text", text: "hello" }]);
  });

  test("converts text block array", () => {
    const params: MessageParam[] = [{ role: "assistant", content: [{ type: "text", text: "hi" }] }];
    const result = toChatMessages(params);
    expect(result[0]?.content).toEqual([{ type: "text", text: "hi" }]);
  });

  test("converts tool_use block", () => {
    const params: MessageParam[] = [
      {
        role: "assistant",
        content: [{ type: "tool_use", id: "id1", name: "bash", input: { cmd: "ls" } }],
      },
    ];
    const result = toChatMessages(params);
    expect(result[0]?.content).toEqual([
      { type: "tool_use", id: "id1", name: "bash", input: { cmd: "ls" } },
    ]);
  });

  test("converts tool_result block with string content", () => {
    const params: MessageParam[] = [
      {
        role: "user",
        content: [{ type: "tool_result", tool_use_id: "id1", content: "output text" }],
      },
    ];
    const result = toChatMessages(params);
    expect(result[0]?.content).toEqual([
      { type: "tool_result", toolUseId: "id1", content: "output text" },
    ]);
  });

  test("converts tool_result block with array content (extracts text)", () => {
    const params: MessageParam[] = [
      {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: "id2",
            content: [
              { type: "text", text: "part1" },
              { type: "text", text: "part2" },
            ],
          },
        ],
      },
    ];
    const result = toChatMessages(params);
    expect(result[0]?.content).toEqual([
      { type: "tool_result", toolUseId: "id2", content: "part1\npart2" },
    ]);
  });

  test("drops unknown block types (e.g. image)", () => {
    const params: MessageParam[] = [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: "image/png", data: "abc" } },
          { type: "text", text: "describe this" },
        ],
      },
    ];
    const result = toChatMessages(params);
    expect(result[0]?.content).toHaveLength(1);
    expect(result[0]?.content[0]).toEqual({ type: "text", text: "describe this" });
  });

  test("preserves message order", () => {
    const params: MessageParam[] = [
      { role: "user", content: "first" },
      { role: "assistant", content: "second" },
      { role: "user", content: "third" },
    ];
    const result = toChatMessages(params);
    expect(result.map((m) => m.content[0])).toEqual([
      { type: "text", text: "first" },
      { type: "text", text: "second" },
      { type: "text", text: "third" },
    ]);
  });
});

describe("toMessageParams", () => {
  test("converts text block back to MessageParam", () => {
    const messages = [{ role: "user" as const, content: [{ type: "text" as const, text: "hi" }] }];
    const result = toMessageParams(messages);
    expect(result).toEqual([{ role: "user", content: [{ type: "text", text: "hi" }] }]);
  });

  test("converts tool_use block back", () => {
    const messages = [
      {
        role: "assistant" as const,
        content: [{ type: "tool_use" as const, id: "id1", name: "bash", input: { cmd: "ls" } }],
      },
    ];
    const result = toMessageParams(messages);
    expect(result[0]?.content).toEqual([
      { type: "tool_use", id: "id1", name: "bash", input: { cmd: "ls" } },
    ]);
  });

  test("converts tool_result block back (toolUseId → tool_use_id)", () => {
    const messages = [
      {
        role: "user" as const,
        content: [{ type: "tool_result" as const, toolUseId: "id1", content: "output" }],
      },
    ];
    const result = toMessageParams(messages);
    expect(result[0]?.content).toEqual([
      { type: "tool_result", tool_use_id: "id1", content: "output" },
    ]);
  });
});

describe("round-trip", () => {
  test("text message survives toChatMessages → toMessageParams", () => {
    const original: MessageParam[] = [
      { role: "user", content: "hello world" },
      { role: "assistant", content: [{ type: "text", text: "response" }] },
    ];
    const roundTripped = toMessageParams(toChatMessages(original));
    expect(roundTripped[0]).toEqual({
      role: "user",
      content: [{ type: "text", text: "hello world" }],
    });
    expect(roundTripped[1]).toEqual({
      role: "assistant",
      content: [{ type: "text", text: "response" }],
    });
  });

  test("tool_use + tool_result round-trip is lossless", () => {
    const original: MessageParam[] = [
      {
        role: "assistant",
        content: [{ type: "tool_use", id: "tid", name: "bash", input: { cmd: "pwd" } }],
      },
      {
        role: "user",
        content: [{ type: "tool_result", tool_use_id: "tid", content: "/home/user" }],
      },
    ];
    const roundTripped = toMessageParams(toChatMessages(original));
    expect(roundTripped[0]?.content).toEqual([
      { type: "tool_use", id: "tid", name: "bash", input: { cmd: "pwd" } },
    ]);
    expect(roundTripped[1]?.content).toEqual([
      { type: "tool_result", tool_use_id: "tid", content: "/home/user" },
    ]);
  });
});
