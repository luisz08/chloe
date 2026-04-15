import type { Message, Session, SessionSummary } from "../session/types.js";

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
}
