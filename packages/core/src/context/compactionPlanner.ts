import { extractPaths } from "./pathExtraction.js";
import type { ChatMessage } from "./types.js";
import { createWorkingSet, topPaths, touchPath } from "./workingSet.js";

export interface CompactionPlan {
  pinnedIndices: Set<number>;
  summarizeIndices: number[];
  workingSetPaths: string[];
}

export interface PlanInput {
  messages: ChatMessage[];
  workspace?: string;
  keepRecentCount: number;
  maxWorkingSetPaths: number;
}

const RECENT_WORKING_SET_WINDOW = 12;

const ERROR_MARKERS = [
  "error:",
  "error ",
  "failed",
  "panic",
  "traceback",
  "stack trace",
  "assertion failed",
  "test failed",
];

const PATCH_MARKERS = [
  "diff --git",
  "+++ b/",
  "--- a/",
  "*** begin patch",
  "*** update file:",
  "*** add file:",
  "*** delete file:",
  "```diff",
  "apply_patch",
];

function messageText(message: ChatMessage): string {
  const parts: string[] = [];
  for (const block of message.content) {
    if (block.type === "text") parts.push(block.text);
    if (block.type === "tool_use")
      parts.push(`[tool_use:${block.name}] ${JSON.stringify(block.input)}`);
    if (block.type === "tool_result") parts.push(block.content);
  }
  return parts.join("\n");
}

function shouldPin(text: string, workingSetPaths: Set<string>): boolean {
  for (const p of workingSetPaths) {
    if (text.includes(p)) return true;
  }
  const lower = text.toLowerCase();
  if (ERROR_MARKERS.some((m) => lower.includes(m))) return true;
  if (PATCH_MARKERS.some((m) => lower.includes(m))) return true;
  return false;
}

function buildWorkingSet(messages: ChatMessage[], maxPaths: number, workspace?: string): string[] {
  const ws = createWorkingSet(maxPaths);
  const recent = messages.slice(-RECENT_WORKING_SET_WINDOW);
  for (const msg of recent) {
    ws.turn++;
    for (const p of extractPaths(msg, workspace)) touchPath(ws, p);
  }
  return topPaths(ws, maxPaths);
}

export function enforceToolCallPairs(messages: ChatMessage[], pinned: Set<number>): void {
  // Build lookup maps
  const callIdToIdx = new Map<string, number>();
  const resultIdToIdx = new Map<string, number>();
  for (let idx = 0; idx < messages.length; idx++) {
    for (const block of messages[idx]?.content ?? []) {
      if (block.type === "tool_use") callIdToIdx.set(block.id, idx);
      if (block.type === "tool_result") resultIdToIdx.set(block.toolUseId, idx);
    }
  }

  const removed = new Set<number>();
  const maxIters = Math.max(messages.length, 10);

  for (let iter = 0; iter < maxIters; iter++) {
    let changed = false;
    const toAdd = new Set<number>();
    const toRemove = new Set<number>();

    for (const idx of pinned) {
      for (const block of messages[idx]?.content ?? []) {
        if (block.type === "tool_result") {
          const callIdx = callIdToIdx.get(block.toolUseId);
          if (callIdx === undefined || removed.has(callIdx)) {
            toRemove.add(idx);
          } else {
            toAdd.add(callIdx);
          }
        }
        if (block.type === "tool_use") {
          const resultIdx = resultIdToIdx.get(block.id);
          if (resultIdx === undefined || removed.has(resultIdx)) {
            toRemove.add(idx);
          } else {
            toAdd.add(resultIdx);
          }
        }
      }
    }

    for (const idx of toAdd) {
      if (!toRemove.has(idx) && !pinned.has(idx)) {
        pinned.add(idx);
        changed = true;
      }
    }
    for (const idx of toRemove) {
      if (pinned.delete(idx)) {
        removed.add(idx);
        changed = true;
      }
    }

    if (!changed) return;
  }

  console.warn("[compactionPlanner] tool pair enforcement did not converge");
}

export function planCompaction(input: PlanInput): CompactionPlan {
  const { messages, workspace, keepRecentCount, maxWorkingSetPaths } = input;
  const len = messages.length;
  const pinned = new Set<number>();

  // Step 1: pin recent window
  const recentStart = Math.max(0, len - keepRecentCount);
  for (let i = recentStart; i < len; i++) pinned.add(i);

  // Step 2: build working set from recent messages
  const workingSetPaths = buildWorkingSet(messages, maxWorkingSetPaths, workspace);
  const pathSet = new Set(workingSetPaths);

  // Step 3: content pins on non-recent messages
  for (let idx = 0; idx < recentStart; idx++) {
    const msg = messages[idx];
    if (!msg) continue;
    if (shouldPin(messageText(msg), pathSet)) pinned.add(idx);
  }

  // Step 4: enforce tool call pair integrity
  enforceToolCallPairs(messages, pinned);

  // Step 5: build summarizeIndices
  const summarizeIndices: number[] = [];
  for (let idx = 0; idx < len; idx++) {
    if (!pinned.has(idx)) summarizeIndices.push(idx);
  }

  return { pinnedIndices: pinned, summarizeIndices, workingSetPaths };
}
