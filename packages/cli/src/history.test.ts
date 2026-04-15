import { describe, expect, it } from "bun:test";
import type { Message } from "@chloe/core";
import { convertStoredMessages } from "./history.js";

function msg(role: Message["role"], content: unknown, id = Math.random().toString(36)): Message {
  return { id, sessionId: "s1", role, content, createdAt: Date.now() };
}

describe("convertStoredMessages", () => {
  it("converts a user text message to a user bubble", () => {
    const result = convertStoredMessages([msg("user", "hello")]);
    expect(result).toHaveLength(1);
    expect(result[0]?.role).toBe("user");
    expect(result[0]?.content).toBe("hello");
    expect(result[0]?.state).toBe("complete");
  });

  it("extracts text from assistant content blocks", () => {
    const content = [{ type: "text", text: "Hi there" }];
    const result = convertStoredMessages([msg("assistant", content)]);
    expect(result).toHaveLength(1);
    expect(result[0]?.role).toBe("assistant");
    expect(result[0]?.content).toBe("Hi there");
  });

  it("creates a tool message for assistant tool_use blocks", () => {
    const content = [{ type: "tool_use", id: "t1", name: "bash", input: { command: "ls" } }];
    const result = convertStoredMessages([msg("assistant", content)]);
    const toolMsgs = result.filter((m) => m.role === "tool");
    expect(toolMsgs).toHaveLength(1);
    expect(toolMsgs[0]?.toolName).toBe("bash");
  });

  it("pairs tool_use with tool_result", () => {
    const assistantContent = [
      { type: "tool_use", id: "t1", name: "bash", input: { command: "ls" } },
    ];
    const userContent = [{ type: "tool_result", tool_use_id: "t1", content: "file.txt" }];
    const result = convertStoredMessages([
      msg("assistant", assistantContent),
      msg("user", userContent),
    ]);
    const toolMsg = result.find((m) => m.role === "tool");
    expect(toolMsg?.toolOutput).toBe("file.txt");
    expect(toolMsg?.state).toBe("done");
  });

  it("skips orphaned tool_result with no matching tool_use", () => {
    const userContent = [{ type: "tool_result", tool_use_id: "orphan", content: "x" }];
    const result = convertStoredMessages([msg("user", userContent)]);
    expect(result.filter((m) => m.role === "tool")).toHaveLength(0);
  });

  it("limits to last 50 raw messages", () => {
    const messages: Message[] = Array.from({ length: 60 }, (_, i) => msg("user", `msg ${i}`));
    const result = convertStoredMessages(messages);
    expect(result.length).toBeLessThanOrEqual(50);
    expect(result.at(-1)?.content).toBe("msg 59");
  });

  it("concatenates multiple text blocks in one assistant message", () => {
    const content = [
      { type: "text", text: "Hello" },
      { type: "text", text: " world" },
    ];
    const result = convertStoredMessages([msg("assistant", content)]);
    expect(result[0]?.content).toBe("Hello world");
  });
});
