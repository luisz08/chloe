import type Anthropic from "@anthropic-ai/sdk";
import type { ResolvedModelConfig } from "../agent/types.js";
import type { StorageAdapter } from "../storage/adapter.js";

export interface ToolContext {
  sessionId: string;
  storage: StorageAdapter;
  client: Anthropic;
  modelConfig: ResolvedModelConfig;
}

export interface Tool {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, { type: string; description?: string }>;
    required?: string[];
  };
  execute(input: unknown, context?: ToolContext): Promise<string>;
}
