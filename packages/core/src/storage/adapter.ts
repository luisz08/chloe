import type { Message, Session, SessionSummary, SessionTree } from "../session/types.js";

export interface StorageAdapter {
  createSession(id: string, name: string): Promise<Session>;
  getSession(id: string): Promise<Session | null>;
  getLastSession(): Promise<Session | null>;
  listSessions(): Promise<SessionSummary[]>;
  deleteSession(id: string): Promise<boolean>;
  touchSession(id: string): Promise<void>;
  appendMessage(
    sessionId: string,
    role: "user" | "assistant" | "tool",
    content: unknown,
  ): Promise<Message>;
  getMessages(sessionId: string): Promise<Message[]>;

  createChildSession(
    parentId: string,
    subagentType: "vision_analyze" | "fast_query" | "deep_reasoning",
    title: string,
  ): Promise<Session>;

  getChildSessions(parentId: string): Promise<Session[]>;

  getSessionTree(rootId: string, maxDepth?: number): Promise<SessionTree>;

  listSessionsByType(subagentType: string): Promise<SessionSummary[]>;
}
