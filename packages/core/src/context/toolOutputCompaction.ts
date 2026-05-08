export interface ToolOutputLimits {
  hardLimitChars: number;
  noisySoftLimitChars: number;
  snippetChars: number;
}

export const NOISY_TOOLS = new Set(["bash", "web_search", "web_fetch"]);

export function defaultToolOutputLimits(): ToolOutputLimits {
  return {
    hardLimitChars: 12_000,
    noisySoftLimitChars: 2_000,
    snippetChars: 900,
  };
}

export function compactToolOutput(
  toolName: string,
  raw: string,
  limits: ToolOutputLimits = defaultToolOutputLimits(),
): string {
  const limit = NOISY_TOOLS.has(toolName) ? limits.noisySoftLimitChars : limits.hardLimitChars;
  if (raw.length <= limit) return raw;

  const head = raw.slice(0, limits.snippetChars);
  const tail = raw.slice(-limits.snippetChars);
  const omitted = raw.length - head.length - tail.length;

  return [
    `[${toolName} output trimmed: ${raw.length} chars]`,
    head,
    `... (${omitted} chars omitted) ...`,
    tail,
  ].join("\n");
}
