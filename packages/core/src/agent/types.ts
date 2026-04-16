import type { MessageParam } from "@anthropic-ai/sdk/resources/messages";
import type { StorageAdapter } from "../storage/adapter.js";
import type { Tool } from "../tools/types.js";

// ─── Routing Types ───────────────────────────────────────────────────────────

export type RouteTokenType = "REASONING" | "FAST" | "VISION";

export interface ImageInput {
  type: "path" | "url";
  value: string;
  mediaType?: string;
}

export interface DetectionState {
  buffer: string;
  lineStart: boolean;
  detected: boolean;
}

export interface RouteDetectionResult {
  detected: boolean;
  token: RouteTokenType | null;
  shouldAbort: boolean;
  remainingText: string;
}

export interface RoutingState {
  currentModel: string;
  routeCount: number;
  callingModel: string | null;
  pendingToolCalls: ToolCallContext[];
}

export interface ToolCallContext {
  toolUseId: string;
  toolName: string;
  toolInput: unknown;
  callingModel: string;
}

export interface ResolvedModelConfig {
  defaultModel: string;
  reasoningModel: string;
  fastModel: string;
  visionModel: string;
}

// ─── Agent Types ──────────────────────────────────────────────────────────────

export interface AgentConfig {
  model: string;
  apiKey: string;
  baseURL?: string;
  tools?: Tool[];
  storage: StorageAdapter;
}

export interface TurnUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
}

export interface AgentCallbacks {
  onToken?: (text: string) => void;
  onToolCall?: (name: string, input: unknown) => void;
  onToolResult?: (name: string, output: string) => void;
  confirmTool?: (name: string, input: unknown) => Promise<boolean>;
  confirmBashCommand?: (binaryName: string) => Promise<boolean>;
  onUsage?: (usage: TurnUsage) => void;
}

export interface RunResult {
  messages: MessageParam[];
  finalText: string;
}
