/**
 * Extracts repo-relative file paths from a ChatMessage.
 *
 * Sources (checked in order):
 *   1. tool_use input object — keys: "path", "file", "target", "cwd"
 *   2. tool_result content — regex scan
 *   3. text blocks — regex scan
 *
 * Paths containing ".." are always dropped.
 * Absolute paths are relativized against workspace when provided;
 * absolute paths that escape workspace are dropped.
 *
 * This module is intentionally kept separate so its heuristics can be
 * tuned independently as chloe's tool set evolves.
 */

import path from "node:path";
import type { CBlock, ChatMessage } from "./types.js";

const ROOT_FILES = new Set([
  "package.json",
  "bun.lock",
  "bun.lockb",
  "tsconfig.json",
  "README.md",
  "CHANGELOG.md",
  "AGENTS.md",
  "Cargo.toml",
  "Cargo.lock",
]);

const PATH_PATTERN =
  /(?:[A-Za-z0-9._-]+\/)+[A-Za-z0-9._-]+\.(?:ts|tsx|js|jsx|mjs|cjs|json|md|txt|yaml|yml|toml|rs|lock|css|scss|html)/g;

function normalize(candidate: string, workspace?: string): string | null {
  let value = candidate.trim().replace(/\\/g, "/");
  if (!value || value.includes("\0") || value.includes("..")) return null;

  if (workspace && path.isAbsolute(value)) {
    const rel = path.relative(workspace, value);
    if (rel.startsWith("..") || path.isAbsolute(rel)) return null;
    value = rel.replace(/\\/g, "/");
  }

  if (path.isAbsolute(value)) return null;
  return value;
}

function looksRepoRelative(value: string): boolean {
  if (ROOT_FILES.has(value)) return true;
  if (/^(src|tests|docs|examples|packages|apps|crates|lib|server|client|\.github)\//.test(value))
    return true;
  return value.includes("/") && /\.[A-Za-z0-9]+$/.test(value);
}

function fromText(text: string, workspace?: string): string[] {
  const out = new Set<string>();
  for (const root of ROOT_FILES) {
    if (text.includes(root)) out.add(root);
  }
  for (const match of text.matchAll(PATH_PATTERN)) {
    const n = normalize(match[0], workspace);
    if (n && looksRepoRelative(n)) out.add(n);
  }
  return [...out];
}

function fromToolInput(input: unknown, workspace?: string): string[] {
  if (!input || typeof input !== "object") return [];
  const obj = input as Record<string, unknown>;
  const out: string[] = [];
  for (const key of ["path", "file", "target", "cwd"]) {
    const v = obj[key];
    if (typeof v === "string") {
      const n = normalize(v, workspace);
      if (n !== null) out.push(n);
    }
  }
  return out;
}

function fromBlock(block: CBlock, workspace?: string): string[] {
  if (block.type === "text") return fromText(block.text, workspace);
  if (block.type === "tool_use") return fromToolInput(block.input, workspace);
  if (block.type === "tool_result") return fromText(block.content, workspace);
  return [];
}

export function extractPaths(message: ChatMessage, workspace?: string): string[] {
  const seen = new Set<string>();
  for (const block of message.content) {
    for (const p of fromBlock(block, workspace)) seen.add(p);
  }
  return [...seen];
}
