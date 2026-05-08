/**
 * WorkingSet tracks file paths referenced in recent tool calls and messages.
 *
 * Each path accumulates a touch count and a last-seen turn index. Paths are
 * scored by touches * 10 + recency bonus (0–10). When the set exceeds
 * maxEntries the lowest-scoring entry is evicted.
 *
 * WorkingSet is rebuilt from scratch on each compaction — it is not persisted.
 * The scoring formula and eviction policy are intentionally simple so that
 * they can be tuned later without changing the interface.
 */

export interface WorkingSetEntry {
  path: string;
  touches: number;
  lastTurn: number;
}

export interface WorkingSet {
  turn: number;
  maxEntries: number;
  entries: Map<string, WorkingSetEntry>;
}

export function createWorkingSet(maxEntries = 50): WorkingSet {
  return { turn: 0, maxEntries, entries: new Map() };
}

/** score = touches * 10 + recency bonus capped at 10 */
export function scoreEntry(entry: WorkingSetEntry, currentTurn: number): number {
  const recency = Math.max(0, 10 - (currentTurn - entry.lastTurn));
  return entry.touches * 10 + recency;
}

function evictLowest(ws: WorkingSet): void {
  let lowestKey = "";
  let lowestScore = Number.POSITIVE_INFINITY;
  for (const [key, entry] of ws.entries) {
    const s = scoreEntry(entry, ws.turn);
    if (s < lowestScore) {
      lowestScore = s;
      lowestKey = key;
    }
  }
  if (lowestKey) ws.entries.delete(lowestKey);
}

export function touchPath(ws: WorkingSet, path: string): void {
  const existing = ws.entries.get(path);
  if (existing) {
    existing.touches += 1;
    existing.lastTurn = ws.turn;
  } else {
    ws.entries.set(path, { path, touches: 1, lastTurn: ws.turn });
    if (ws.entries.size > ws.maxEntries) evictLowest(ws);
  }
}

export function topPaths(ws: WorkingSet, max: number): string[] {
  return [...ws.entries.values()]
    .sort((a, b) => scoreEntry(b, ws.turn) - scoreEntry(a, ws.turn))
    .slice(0, max)
    .map((e) => e.path);
}
