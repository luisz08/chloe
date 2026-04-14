import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";

export interface BashSettings {
  /** Additional commands beyond the built-in defaults */
  allowedCommands: string[];
  timeoutMs: number;
  maxOutputBytes: number;
}

export interface ReadFileSettings {
  maxOutputBytes: number;
}

export interface ToolSettings {
  /** Resolved absolute paths the tools may access */
  allowedPaths: string[];
  bash: BashSettings;
  readFile: ReadFileSettings;
}

export const SETTINGS_PATH = (cwd: string) => join(cwd, ".chloe", "settings.json");

export function DEFAULT_TOOL_SETTINGS(cwd: string): ToolSettings {
  return {
    allowedPaths: [cwd],
    bash: { allowedCommands: [], timeoutMs: 30000, maxOutputBytes: 32768 },
    readFile: { maxOutputBytes: 32768 },
  };
}

function expandHome(p: string): string {
  if (p.startsWith("~/")) return join(homedir(), p.slice(2));
  if (p === "~") return homedir();
  return p;
}

function resolvePath(p: string, cwd: string): string {
  const expanded = expandHome(p);
  if (isAbsolute(expanded)) return expanded;
  return resolve(cwd, expanded);
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function num(v: unknown, fallback: number): number {
  return typeof v === "number" ? v : fallback;
}

function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function section(obj: Record<string, unknown>, key: string): Record<string, unknown> {
  const val = obj[key];
  return val !== null && typeof val === "object" && !Array.isArray(val)
    ? (val as Record<string, unknown>)
    : {};
}

export function loadToolSettings(cwd: string): ToolSettings {
  const defaults = DEFAULT_TOOL_SETTINGS(cwd);
  const path = SETTINGS_PATH(cwd);

  if (!existsSync(path)) return defaults;

  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(readFileSync(path, "utf-8")) as Record<string, unknown>;
  } catch {
    process.stderr.write("[chloe] warning: malformed .chloe/settings.json — using defaults\n");
    return defaults;
  }

  const tools = section(raw, "tools");
  const bash = section(tools, "bash");
  const readFile = section(tools, "read_file");

  const rawPaths = arr(tools.allowed_paths).map((p) => resolvePath(str(p), cwd));
  const allowedPaths = rawPaths.length > 0 ? rawPaths : [cwd];

  return {
    allowedPaths,
    bash: {
      allowedCommands: arr(bash.allowed_commands).map(str).filter(Boolean),
      timeoutMs: num(bash.timeout_ms, defaults.bash.timeoutMs),
      maxOutputBytes: num(bash.max_output_bytes, defaults.bash.maxOutputBytes),
    },
    readFile: {
      maxOutputBytes: num(readFile.max_output_bytes, defaults.readFile.maxOutputBytes),
    },
  };
}
