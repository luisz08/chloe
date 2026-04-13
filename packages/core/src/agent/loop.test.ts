import { describe, expect, it } from "bun:test";
import type Anthropic from "@anthropic-ai/sdk";
import type {
  Message,
  RawMessageStreamEvent,
  TextBlock,
  ToolUseBlock,
} from "@anthropic-ai/sdk/resources/messages";
import { ToolRegistry } from "../tools/registry.js";
import type { Tool } from "../tools/types.js";
import { runLoop } from "./loop.js";

// ─── Mock helpers ────────────────────────────────────────────────────────────

function makeTextEvents(text: string): RawMessageStreamEvent[] {
  return [
    { type: "message_start", message: {} as Message },
    {
      type: "content_block_start",
      index: 0,
      content_block: { type: "text", text: "" } as TextBlock,
    },
    { type: "content_block_delta", index: 0, delta: { type: "text_delta", text } },
    { type: "content_block_stop", index: 0 },
    {
      type: "message_delta",
      delta: { stop_reason: "end_turn", stop_sequence: null },
      usage: { output_tokens: 10 },
    },
    { type: "message_stop" },
  ];
}

function makeToolUseEvents(_id: string, _name: string, _input: unknown): RawMessageStreamEvent[] {
  return [
    { type: "message_start", message: {} as Message },
    {
      type: "content_block_start",
      index: 0,
      content_block: { type: "text", text: "" } as TextBlock,
    },
    { type: "content_block_stop", index: 0 },
    {
      type: "message_delta",
      delta: { stop_reason: "tool_use", stop_sequence: null },
      usage: { output_tokens: 10 },
    },
    { type: "message_stop" },
  ];
}

interface MockStreamOptions {
  events: RawMessageStreamEvent[];
  finalMsg: Message;
}

function makeMockStream(options: MockStreamOptions) {
  return {
    [Symbol.asyncIterator]: async function* () {
      for (const event of options.events) {
        yield event;
      }
    },
    finalMessage: async () => options.finalMsg,
  };
}

function makeFinalTextMessage(text: string): Message {
  return {
    id: "msg_1",
    type: "message",
    role: "assistant",
    content: [{ type: "text", text }],
    model: "claude-test",
    stop_reason: "end_turn",
    stop_sequence: null,
    usage: { input_tokens: 10, output_tokens: 10 },
  };
}

function makeFinalToolMessage(id: string, name: string, input: unknown): Message {
  return {
    id: "msg_tool",
    type: "message",
    role: "assistant",
    content: [{ type: "tool_use", id, name, input } as ToolUseBlock],
    model: "claude-test",
    stop_reason: "tool_use",
    stop_sequence: null,
    usage: { input_tokens: 10, output_tokens: 10 },
  };
}

// Creates a mock Anthropic client
function makeMockClient(
  responses: Array<{ events: RawMessageStreamEvent[]; finalMsg: Message }>,
): Anthropic {
  let callIndex = 0;
  return {
    messages: {
      stream: (_params: unknown) => {
        const response = responses[callIndex];
        if (response === undefined) {
          throw new Error(`Unexpected stream call at index ${callIndex}`);
        }
        callIndex++;
        return makeMockStream(response);
      },
    },
  } as unknown as Anthropic;
}

function makeEchoTool(): Tool {
  return {
    name: "echo",
    description: "Echoes input",
    inputSchema: {
      type: "object",
      properties: { message: { type: "string" } },
      required: ["message"],
    },
    async execute(input: unknown): Promise<string> {
      const { message } = input as { message: string };
      return message;
    },
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("runLoop", () => {
  it("single turn with no tools returns final text", async () => {
    const finalMsg = makeFinalTextMessage("Hello from the model!");
    const client = makeMockClient([{ events: makeTextEvents("Hello from the model!"), finalMsg }]);

    const registry = new ToolRegistry();
    const tokens: string[] = [];

    const result = await runLoop({
      messages: [{ role: "user", content: "Hello" }],
      client,
      model: "claude-test",
      tools: registry,
      callbacks: { onToken: (t) => tokens.push(t) },
    });

    expect(result.finalText).toBe("Hello from the model!");
    expect(tokens).toContain("Hello from the model!");
    expect(result.messages.at(-1)?.role).toBe("assistant");
  });

  it("tool call confirmed — executes tool and continues to end_turn", async () => {
    const toolId = "tool_abc";
    const toolInput = { message: "hello" };
    const toolFinalMsg = makeFinalToolMessage(toolId, "echo", toolInput);
    const afterToolMsg = makeFinalTextMessage("Echo done.");

    const client = makeMockClient([
      { events: makeToolUseEvents(toolId, "echo", toolInput), finalMsg: toolFinalMsg },
      { events: makeTextEvents("Echo done."), finalMsg: afterToolMsg },
    ]);

    const registry = new ToolRegistry();
    registry.register(makeEchoTool());

    const toolCalls: string[] = [];
    const toolResults: string[] = [];

    const result = await runLoop({
      messages: [{ role: "user", content: "Echo hello" }],
      client,
      model: "claude-test",
      tools: registry,
      callbacks: {
        onToolCall: (name) => toolCalls.push(name),
        onToolResult: (_, output) => toolResults.push(output),
        confirmTool: async () => true,
      },
    });

    expect(toolCalls).toContain("echo");
    expect(toolResults).toContain("hello");
    expect(result.finalText).toBe("Echo done.");
  });

  it("tool call denied — injects denial observation and continues", async () => {
    const toolId = "tool_xyz";
    const toolInput = { message: "secret" };
    const toolFinalMsg = makeFinalToolMessage(toolId, "echo", toolInput);
    const afterDenialMsg = makeFinalTextMessage("Understood, I won't echo that.");

    const client = makeMockClient([
      { events: makeToolUseEvents(toolId, "echo", toolInput), finalMsg: toolFinalMsg },
      { events: makeTextEvents("Understood, I won't echo that."), finalMsg: afterDenialMsg },
    ]);

    const registry = new ToolRegistry();
    registry.register(makeEchoTool());

    const result = await runLoop({
      messages: [{ role: "user", content: "Echo secret" }],
      client,
      model: "claude-test",
      tools: registry,
      callbacks: {
        confirmTool: async () => false,
      },
    });

    // The tool_result message injected should contain the denial message
    const userTurns = result.messages.filter((m) => m.role === "user");
    const denialTurn = userTurns.find((m) => {
      if (!Array.isArray(m.content)) return false;
      return m.content.some(
        (c) =>
          typeof c === "object" &&
          c !== null &&
          "type" in c &&
          c.type === "tool_result" &&
          "content" in c &&
          typeof c.content === "string" &&
          c.content.includes("denied"),
      );
    });
    expect(denialTurn).toBeDefined();
    expect(result.finalText).toBe("Understood, I won't echo that.");
  });

  it("unknown tool — injects error observation and continues", async () => {
    const toolId = "tool_unk";
    const toolFinalMsg = makeFinalToolMessage(toolId, "nonexistent-tool", {});
    const afterMsg = makeFinalTextMessage("Tool not found response.");

    const client = makeMockClient([
      { events: makeToolUseEvents(toolId, "nonexistent-tool", {}), finalMsg: toolFinalMsg },
      { events: makeTextEvents("Tool not found response."), finalMsg: afterMsg },
    ]);

    const registry = new ToolRegistry();

    const result = await runLoop({
      messages: [{ role: "user", content: "Use nonexistent tool" }],
      client,
      model: "claude-test",
      tools: registry,
      callbacks: {},
    });

    const userTurns = result.messages.filter((m) => m.role === "user");
    const errorTurn = userTurns.find((m) => {
      if (!Array.isArray(m.content)) return false;
      return m.content.some(
        (c) =>
          typeof c === "object" &&
          c !== null &&
          "content" in c &&
          typeof c.content === "string" &&
          c.content.includes("Unknown tool"),
      );
    });
    expect(errorTurn).toBeDefined();
  });

  it("multi-turn loop — loops until end_turn after multiple tool calls", async () => {
    const tool1Id = "tool_1";
    const tool2Id = "tool_2";
    const toolInput = { message: "multi" };

    const firstToolMsg = makeFinalToolMessage(tool1Id, "echo", toolInput);
    const secondToolMsg = makeFinalToolMessage(tool2Id, "echo", toolInput);
    const finalEndMsg = makeFinalTextMessage("All done.");

    const client = makeMockClient([
      { events: makeToolUseEvents(tool1Id, "echo", toolInput), finalMsg: firstToolMsg },
      { events: makeToolUseEvents(tool2Id, "echo", toolInput), finalMsg: secondToolMsg },
      { events: makeTextEvents("All done."), finalMsg: finalEndMsg },
    ]);

    const registry = new ToolRegistry();
    registry.register(makeEchoTool());

    let toolCallCount = 0;

    const result = await runLoop({
      messages: [{ role: "user", content: "Echo twice" }],
      client,
      model: "claude-test",
      tools: registry,
      callbacks: {
        onToolCall: () => {
          toolCallCount++;
        },
        confirmTool: async () => true,
      },
    });

    expect(toolCallCount).toBe(2);
    expect(result.finalText).toBe("All done.");
  });
});
