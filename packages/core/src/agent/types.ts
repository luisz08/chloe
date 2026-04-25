import type { MessageParam } from "@anthropic-ai/sdk/resources/messages";
import type { ContextCompressionConfig, SearchConfig } from "../config.js";
import type { StorageAdapter } from "../storage/adapter.js";
import type { Tool } from "../tools/types.js";

// ─── Routing Types ───────────────────────────────────────────────────────────

export const ImageInputType = {
  Path: "path",
  Url: "url",
} as const;
export type ImageInputType = (typeof ImageInputType)[keyof typeof ImageInputType];

/**
 * Image input detected in user message.
 */
export interface ImageInput {
  type: ImageInputType;
  value: string;
  mediaType?: string;
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
  /** Optional: context compression configuration */
  contextCompression?: ContextCompressionConfig;
  /** Optional: search configuration for web_search tool */
  search?: SearchConfig;
}

export interface CompressionInfo {
  compressedCount: number;
  keptCount: number;
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
  onContextCompressed?: (info: CompressionInfo) => void;
}

export interface RunResult {
  messages: MessageParam[];
  finalText: string;
}
