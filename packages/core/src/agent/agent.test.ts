import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { Message, Session, SessionSummary } from "../session/types.js";
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
      const s: Session = { id, name, createdAt: Date.now(), updatedAt: Date.now() };
      sessions.set(id, s);
      return s;
    },
    async getSession(id) {
      return sessions.get(id) ?? null;
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
