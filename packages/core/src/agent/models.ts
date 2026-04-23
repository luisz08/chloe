const MODEL_CONTEXT_LIMITS: Record<string, number> = {
  "claude-opus-4-6": 200_000,
  "claude-sonnet-4-6": 200_000,
  "claude-haiku-4-5": 200_000,
};

export function getContextLimit(modelName: string): number {
  for (const [prefix, limit] of Object.entries(MODEL_CONTEXT_LIMITS)) {
    if (modelName.startsWith(prefix)) return limit;
  }
  return 200_000;
}
