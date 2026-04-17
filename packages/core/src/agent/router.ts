/**
 * Model routing module for multi-model selection.
 *
 * Handles model configuration resolution and fallback logic.
 * Note: Route tokens removed - use subagent tools for model delegation.
 */

import type { ResolvedModelConfig } from "./types.js";

// ─── Constants ────────────────────────────────────────────────────────────────

export const DEFAULT_MODEL = "claude-sonnet-4-6";

export const SUPPORTED_IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp"];

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
 * Select initial model for a request based on input content.
 * Returns visionModel if images detected, otherwise defaultModel.
 */
export function selectInitialModel(hasImages: boolean, config: ResolvedModelConfig): string {
  if (hasImages) {
    return config.visionModel;
  }
  return config.defaultModel;
}

/**
 * Check if the resolved config is effectively multi-model.
 * Returns true iff any specialized model differs from defaultModel.
 */
export function isMultiModel(config: ResolvedModelConfig): boolean {
  return (
    config.reasoningModel !== config.defaultModel ||
    config.fastModel !== config.defaultModel ||
    config.visionModel !== config.defaultModel
  );
}
