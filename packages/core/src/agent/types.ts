import type { MessageParam } from "@anthropic-ai/sdk/resources/messages";
import type { StorageAdapter } from "../storage/adapter.js";
import type { Tool } from "../tools/types.js";

export interface AgentConfig {
  model: string;
  apiKey: string;
  baseURL?: string;
  tools?: Tool[];
  storage: StorageAdapter;
}

export interface AgentCallbacks {
  onToken?: (text: string) => void;
  onToolCall?: (name: string, input: unknown) => void;
  onToolResult?: (name: string, output: string) => void;
  confirmTool?: (name: string, input: unknown) => Promise<boolean>;
}

export interface RunResult {
  messages: MessageParam[];
  finalText: string;
}
