/**
 * Model routing module for multi-model selection.
 *
 * Handles route token detection, model selection, and fallback resolution.
 */

import type { ResolvedModelConfig, RouteTokenType } from "./types.js";

// ─── Constants ────────────────────────────────────────────────────────────────

export const ROUTE_TOKENS: Record<RouteTokenType, string> = {
  REASONING: "[REASONING]",
  FAST: "[FAST]",
  VISION: "[VISION]",
} as const;

export const MAX_ROUTE_SWITCHES = 5;

export const DEFAULT_MODEL = "claude-sonnet-4-6";

export const SUPPORTED_IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp"];

// ─── System Prompt for Routing ────────────────────────────────────────────────

export const ROUTING_SYSTEM_PROMPT = `
You are an AI assistant with routing capabilities.

Before responding, you may output a routing token at the START of your response (on its own line):
- Output "[REASONING]" if this requires deep analysis, multi-step reasoning, or complex problem-solving
- Output "[FAST]" if this is a simple, quick query that needs minimal processing
- Output "[VISION]" if you need to analyze images (image requests are pre-routed, so this is rare)

Then continue with your actual response.

Examples:
[REASONING]
Let me analyze the architectural trade-offs...

[FAST]
The capital of France is Paris.

(No token for moderate complexity)
Here's a balanced explanation...
`;

// ─── Model Router ──────────────────────────────────────────────────────────────

/**
 * Resolve model configuration with fallback logic.
 */
export function resolveModelConfig(
  config: Partial<{
    defaultModel?: string;
    reasoningModel?: string;
    fastModel?: string;
    visionModel?: string;
  }>,
): ResolvedModelConfig {
  const defaultModel = config.defaultModel ?? DEFAULT_MODEL;

  return {
    defaultModel,
    reasoningModel: config.reasoningModel ?? defaultModel,
    fastModel: config.fastModel ?? defaultModel,
    visionModel: config.visionModel ?? defaultModel,
  };
}

/**
 * Resolve target model from route token.
 * Returns fallback to defaultModel if target not configured.
 */
export function resolveTargetModel(token: RouteTokenType, config: ResolvedModelConfig): string {
  switch (token) {
    case "REASONING":
      return config.reasoningModel;
    case "FAST":
      return config.fastModel;
    case "VISION":
      return config.visionModel;
    default:
      return config.defaultModel;
  }
}

/**
 * Select initial model for a request based on input content.
 * Returns visionModel if images detected, otherwise defaultModel.
 */
export function selectInitialModel(hasImages: boolean, config: ResolvedModelConfig): string {
  if (hasImages) {
    return config.visionModel;
  }
  return config.defaultModel;
}
