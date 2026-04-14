import type { LogLevel } from "./types.js";

const LEVEL_LABELS: Record<LogLevel, string> = {
  debug: "DEBUG",
  info: "INFO ",
  warn: "WARN ",
  error: "ERROR",
};

function serializeField(value: unknown): string {
  const str = String(value);
  const truncated = str.length > 200 ? str.slice(0, 200) : str;
  return truncated.includes(" ") ? `"${truncated}"` : truncated;
}

export function formatLine(
  level: LogLevel,
  component: string,
  msg: string,
  fields?: Record<string, unknown>,
): string {
  const timestamp = new Date().toISOString();
  const label = LEVEL_LABELS[level];
  let line = `${timestamp} [${label}] ${component}: ${msg}`;

  if (fields) {
    const pairs = Object.entries(fields)
      .map(([k, v]) => `${k}=${serializeField(v)}`)
      .join(" ");
    if (pairs.length > 0) {
      line += ` ${pairs}`;
    }
  }

  return line;
}
