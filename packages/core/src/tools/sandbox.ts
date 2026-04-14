import { homedir } from "node:os";
import { isAbsolute, join, normalize, resolve } from "node:path";

export const BUILTIN_COMMANDS = [
  "ls",
  "cat",
  "grep",
  "find",
  "echo",
  "pwd",
  "wc",
  "head",
  "tail",
] as const;

export interface SandboxSettings {
  allowedCommands: string[];
  allowedPaths: string[];
}

function expandHome(p: string): string {
  if (p.startsWith("~/")) return join(homedir(), p.slice(2));
  if (p === "~") return homedir();
  return p;
}

/** Resolve a user-supplied path to an absolute path (does not require the path to exist). */
function resolvePath(filePath: string, cwd: string): string {
  const expanded = expandHome(filePath);
  if (isAbsolute(expanded)) return normalize(expanded);
  return normalize(resolve(cwd, expanded));
}

/**
 * Check if a path is within any of the allowed directories.
 * Returns null if allowed, or an error string if denied.
 */
export function validatePath(filePath: string, allowedPaths: string[], cwd: string): string | null {
  const resolved = resolvePath(filePath, cwd);
  const allowed = allowedPaths.some((p) => {
    const base = normalize(isAbsolute(p) ? p : resolve(cwd, p));
    return resolved === base || resolved.startsWith(`${base}/`);
  });
  if (!allowed) {
    return `Access denied: path is outside allowed directories: ${filePath}`;
  }
  return null;
}

/** Naive shell word-split (handles quoted strings and flags). */
function shellWordSplit(segment: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let inSingle = false;
  let inDouble = false;

  for (const ch of segment.trim()) {
    if (ch === "'" && !inDouble) {
      inSingle = !inSingle;
      continue;
    }
    if (ch === '"' && !inSingle) {
      inDouble = !inDouble;
      continue;
    }
    if (ch === " " && !inSingle && !inDouble) {
      if (current.length > 0) {
        tokens.push(current);
        current = "";
      }
    } else {
      current += ch;
    }
  }
  if (current.length > 0) tokens.push(current);
  return tokens;
}

/** Heuristic: does this token look like a file-system path? */
function looksLikePath(token: string): boolean {
  return (
    token.startsWith("/") ||
    token.startsWith("~") ||
    token.startsWith("./") ||
    token.startsWith("../") ||
    token === ".." ||
    token === "."
  );
}

/**
 * Validate a bash command string against the sandbox settings.
 * Returns null if valid, or an error string if denied.
 */
export function validateBashCommand(
  command: string,
  settings: SandboxSettings,
  cwd: string,
): string | null {
  const allAllowed = new Set([...BUILTIN_COMMANDS, ...settings.allowedCommands]);

  // Split on unquoted pipes
  const segments = command.split(/(?<!['"\\])\|(?!['"\\])/);

  for (const segment of segments) {
    const tokens = shellWordSplit(segment);
    if (tokens.length === 0) continue;

    const binary = tokens[0] ?? "";
    // Strip any path prefix (e.g. /usr/bin/ls → ls)
    const binaryName = binary.split("/").at(-1) ?? binary;

    if (!allAllowed.has(binaryName)) {
      return `Command not allowed: ${binaryName} is not in the allowed commands list`;
    }

    for (const token of tokens.slice(1)) {
      if (looksLikePath(token)) {
        const err = validatePath(token, settings.allowedPaths, cwd);
        if (err !== null) {
          return err;
        }
      }
    }
  }

  return null;
}
