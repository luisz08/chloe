export type MessageRole = "user" | "assistant" | "tool";

export type MessageState =
  | "complete"
  | "streaming"
  | "pending"
  | "confirmed"
  | "denied"
  | "done"
  | "session-allowed";

export type ConfirmResult = "allow-once" | "deny" | "allow-session";

export type UIStatus = "idle" | "thinking" | "streaming";

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  toolName?: string;
  toolInput?: unknown;
  toolOutput?: string;
  state: MessageState;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
}

export interface AppState {
  sessionId: string;
  modelName: string;
  contextLimit: number;
  messages: ChatMessage[];
  tokenUsage: TokenUsage;
  status: UIStatus;
  exitPrompt: boolean;
  inputValue: string;
}

export { getContextLimit } from "@chloe/core";
