import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { Message, Session, SessionSummary, SessionTree } from "../session/types.js";
import type { StorageAdapter } from "../storage/adapter.js";

// ─── Mock @anthropic-ai/sdk ──────────────────────────────────────────────────
// Capture constructor options so we can assert baseURL is passed through.

const anthropicCalls: Array<{ apiKey: string; baseURL?: string }> = [];

mock.module("@anthropic-ai/sdk", () => ({
  default: class MockAnthropic {
    messages = {
      stream: () => {
        throw new Error("provider unavailable");
      },
    };
    constructor(opts: { apiKey: string; baseURL?: string }) {
      anthropicCalls.push(
        opts.baseURL !== undefined
          ? { apiKey: opts.apiKey, baseURL: opts.baseURL }
          : { apiKey: opts.apiKey },
      );
    }
  },
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeMemoryStorage(): StorageAdapter {
  const sessions = new Map<string, Session>();
  const msgs = new Map<string, Message[]>();
  let msgId = 0;

  return {
    async createSession(id, name) {
      const s: Session = {
        id,
        name,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        parentId: null,
        subagentType: null,
      };
      sessions.set(id, s);
      return s;
    },
    async getSession(id) {
      return sessions.get(id) ?? null;
    },
    async getLastSession(): Promise<Session | null> {
      const all = [...sessions.values()].sort((a, b) => b.updatedAt - a.updatedAt);
      return all[0] ?? null;
    },
    async listSessions(): Promise<SessionSummary[]> {
      return [...sessions.values()].map((s) => ({
        ...s,
        messageCount: msgs.get(s.id)?.length ?? 0,
      }));
    },
    async deleteSession(id) {
      sessions.delete(id);
      msgs.delete(id);
      return true;
    },
    async touchSession(id) {
      const s = sessions.get(id);
      if (s) s.updatedAt = Date.now();
    },
    async appendMessage(sessionId, role, content) {
      const list = msgs.get(sessionId) ?? [];
      const m: Message = { id: String(++msgId), sessionId, role, content, createdAt: Date.now() };
      list.push(m);
      msgs.set(sessionId, list);
      return m;
    },
    async getMessages(sessionId) {
      return msgs.get(sessionId) ?? [];
    },
    async createChildSession(parentId, subagentType, title) {
      const id = `${parentId}-${subagentType}-${Date.now()}`;
      const s: Session = {
        id,
        name: title,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        parentId,
        subagentType,
      };
      sessions.set(id, s);
      return s;
    },
    async getChildSessions(parentId) {
      return [...sessions.values()]
        .filter((s) => s.parentId === parentId)
        .sort((a, b) => a.createdAt - b.createdAt);
    },
    async getSessionTree(rootId, maxDepth = 10): Promise<SessionTree> {
      const root = sessions.get(rootId);
      if (root === undefined) {
        throw new Error(`Session not found: ${rootId}`);
      }
      const messages = msgs.get(rootId) ?? [];
      const children = [...sessions.values()]
        .filter((s) => s.parentId === rootId)
        .map((child) => this.getSessionTree(child.id, maxDepth - 1));
      return { session: root, messages, children: await Promise.all(children) };
    },
    async listSessionsByType(subagentType) {
      return [...sessions.values()]
        .filter((s) => s.subagentType === subagentType)
        .map((s) => ({ ...s, messageCount: msgs.get(s.id)?.length ?? 0 }))
        .sort((a, b) => b.updatedAt - a.updatedAt);
    },
  };
}

// ─── Dynamic import (after mock is registered) ───────────────────────────────
const { createAgent } = await import("./agent.js");

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Agent — provider configuration", () => {
  beforeEach(() => {
    anthropicCalls.length = 0;
  });

  it("(a) passes baseURL to Anthropic client when provided in config", () => {
    createAgent({
      model: "test-model",
      apiKey: "test-key",
      baseURL: "https://openrouter.ai/api/v1",
      tools: [],
      storage: makeMemoryStorage(),
    });

    expect(anthropicCalls).toHaveLength(1);
    expect(anthropicCalls[0]?.baseURL).toBe("https://openrouter.ai/api/v1");
  });

  it("(a) omits baseURL from Anthropic client when not provided", () => {
    createAgent({
      model: "test-model",
      apiKey: "test-key",
      tools: [],
      storage: makeMemoryStorage(),
    });

    expect(anthropicCalls).toHaveLength(1);
    expect(anthropicCalls[0]?.baseURL).toBeUndefined();
  });

  it("(b) propagates provider errors out of agent.run()", async () => {
    const agent = createAgent({
      model: "test-model",
      apiKey: "test-key",
      baseURL: "https://openrouter.ai/api/v1",
      tools: [],
      storage: makeMemoryStorage(),
    });

    await expect(agent.run("session-1", "hello", {})).rejects.toThrow("provider unavailable");
  });
});

// ─── Subagent Tool Gating Tests ───────────────────────────────────────────────

import type Anthropic from "@anthropic-ai/sdk";
import type { TextBlock } from "@anthropic-ai/sdk/resources/messages";
import { SQLiteStorageAdapter } from "../storage/sqlite.js";
import { resolveModelConfig } from "./router.js";

// Mock helpers for stream capture

interface CapturedStreamParams {
  model: string;
  system?: string | undefined;
  tools: Array<{ name: string }>;
}

function makeCapturingMockModule(captured: CapturedStreamParams[]) {
  return {
    default: class MockAnthropic {
      messages = {
        stream: (params: unknown) => {
          const p = params as Anthropic.Messages.MessageStreamParams;
          const entry: CapturedStreamParams = {
            model: p.model,
            tools: (p.tools ?? []).map((t) => ({ name: t.name })),
          };
          if (typeof p.system === "string") {
            entry.system = p.system;
          }
          captured.push(entry);
          return {
            [Symbol.asyncIterator]: async function* () {
              yield { type: "message_start", message: {} };
              yield {
                type: "content_block_start",
                index: 0,
                content_block: { type: "text", text: "" },
              };
              yield {
                type: "content_block_delta",
                index: 0,
                delta: { type: "text_delta", text: "OK" },
              };
              yield { type: "content_block_stop", index: 0 };
              yield {
                type: "message_delta",
                delta: { stop_reason: "end_turn", stop_sequence: null },
                usage: { output_tokens: 10 },
              };
              yield { type: "message_stop" };
            },
            finalMessage: async () => ({
              id: "msg_1",
              type: "message",
              role: "assistant",
              content: [{ type: "text", text: "OK" } as TextBlock],
              model: "claude-test",
              stop_reason: "end_turn",
              stop_sequence: null,
              usage: { input_tokens: 10, output_tokens: 10 },
            }),
          };
        },
      };
    },
  };
}

describe("Agent — subagent tool gating", () => {
  it("single-model config omits subagent tools", async () => {
    const captured: CapturedStreamParams[] = [];
    mock.module("@anthropic-ai/sdk", () => makeCapturingMockModule(captured));

    // Re-import after mock
    const { Agent: MockAgent } = await import("./agent.js");

    const storage = new SQLiteStorageAdapter(":memory:");
    const modelConfig = resolveModelConfig({ defaultModel: "claude-sonnet-4-6" });

    const agent = new MockAgent({
      model: "claude-sonnet-4-6",
      apiKey: "sk-test",
      storage,
      modelConfig,
    });

    await agent.run("test-session", "Hello");

    expect(captured.length).toBeGreaterThan(0);
    const streamParams = captured[0];
    const toolNames = streamParams?.tools.map((t) => t.name) ?? [];
    expect(toolNames).not.toContain("vision_analyze");
    expect(toolNames).not.toContain("fast_query");
    expect(toolNames).not.toContain("deep_reasoning");
  });

  it("single-model config omits subagent system prompt", async () => {
    const captured: CapturedStreamParams[] = [];
    mock.module("@anthropic-ai/sdk", () => makeCapturingMockModule(captured));

    const { Agent: MockAgent } = await import("./agent.js");

    const storage = new SQLiteStorageAdapter(":memory:");
    const modelConfig = resolveModelConfig({ defaultModel: "claude-sonnet-4-6" });

    const agent = new MockAgent({
      model: "claude-sonnet-4-6",
      apiKey: "sk-test",
      storage,
      modelConfig,
    });

    await agent.run("test-session", "Hello");

    expect(captured.length).toBeGreaterThan(0);
    expect(captured[0]?.system).toBeUndefined();
  });

  it("multi-model config registers all subagent tools", async () => {
    const captured: CapturedStreamParams[] = [];
    mock.module("@anthropic-ai/sdk", () => makeCapturingMockModule(captured));

    const { Agent: MockAgent } = await import("./agent.js");

    const storage = new SQLiteStorageAdapter(":memory:");
    const modelConfig = resolveModelConfig({
      defaultModel: "claude-sonnet-4-6",
      fastModel: "claude-haiku-4-5-20251001",
    });

    const agent = new MockAgent({
      model: "claude-sonnet-4-6",
      apiKey: "sk-test",
      storage,
      modelConfig,
    });

    await agent.run("test-session", "Hello");

    expect(captured.length).toBeGreaterThan(0);
    const streamParams = captured[0];
    const toolNames = streamParams?.tools.map((t) => t.name) ?? [];
    expect(toolNames).toContain("vision_analyze");
    expect(toolNames).toContain("fast_query");
    expect(toolNames).toContain("deep_reasoning");
  });

  it("multi-model config attaches subagent system prompt", async () => {
    const captured: CapturedStreamParams[] = [];
    mock.module("@anthropic-ai/sdk", () => makeCapturingMockModule(captured));

    const { Agent: MockAgent } = await import("./agent.js");

    const storage = new SQLiteStorageAdapter(":memory:");
    const modelConfig = resolveModelConfig({
      defaultModel: "claude-sonnet-4-6",
      fastModel: "claude-haiku-4-5-20251001",
    });

    const agent = new MockAgent({
      model: "claude-sonnet-4-6",
      apiKey: "sk-test",
      storage,
      modelConfig,
    });

    await agent.run("test-session", "Hello");

    expect(captured.length).toBeGreaterThan(0);
    const systemPrompt = captured[0]?.system;
    expect(systemPrompt).toBeDefined();
    expect(systemPrompt).toContain("subagent");
  });

  it("caller-supplied tools disable subagent prompt even in multi-model config", async () => {
    const captured: CapturedStreamParams[] = [];
    mock.module("@anthropic-ai/sdk", () => makeCapturingMockModule(captured));

    const { Agent: MockAgent } = await import("./agent.js");

    const storage = new SQLiteStorageAdapter(":memory:");
    const modelConfig = resolveModelConfig({
      defaultModel: "claude-sonnet-4-6",
      fastModel: "claude-haiku-4-5-20251001",
    });

    const customTool = {
      name: "custom_tool",
      description: "A custom tool",
      inputSchema: { type: "object" as const, properties: {}, required: [] },
      async execute(): Promise<string> {
        return "done";
      },
    };

    const agent = new MockAgent({
      model: "claude-sonnet-4-6",
      apiKey: "sk-test",
      storage,
      modelConfig,
      tools: [customTool],
    });

    await agent.run("test-session", "Hello");

    expect(captured.length).toBeGreaterThan(0);
    const streamParams = captured[0];
    const toolNames = streamParams?.tools.map((t) => t.name) ?? [];
    expect(toolNames).toEqual(["custom_tool"]);
    expect(toolNames).not.toContain("vision_analyze");
    expect(toolNames).not.toContain("fast_query");
    expect(toolNames).not.toContain("deep_reasoning");
    expect(streamParams?.system).toBeUndefined();
  });
});
