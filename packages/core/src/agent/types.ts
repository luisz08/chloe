import type { MessageParam } from "@anthropic-ai/sdk/resources/messages";
import type { StorageAdapter } from "../storage/adapter.js";
import type { Tool } from "../tools/types.js";

// ─── Routing Types ───────────────────────────────────────────────────────────

/**
 * Image input detected in user message.
 */
export interface ImageInput {
  type: "path" | "url";
  value: string;
  mediaType?: string;
}

/**
 * Routing state for tracking current execution context.
 * Note: Route tokens removed - use subagent tools instead.
 */
export interface RoutingState {
  currentModel: string;
  callingTool: string | null;
}

/**
 * Tool call context for tracking execution.
 */
export interface ToolCallContext {
  toolUseId: string;
  toolName: string;
  toolInput: unknown;
  callingModel: string;
}

/**
 * Resolved model configuration with fallback logic.
 */
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
  /** Optional: full model configuration for multi-model routing */
  modelConfig?: ResolvedModelConfig;
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
