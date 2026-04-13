export interface Session {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
}

export interface SessionSummary extends Session {
  messageCount: number;
}

export interface Message {
  id: string;
  sessionId: string;
  role: "user" | "assistant" | "tool";
  content: unknown;
  createdAt: number;
}
