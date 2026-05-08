import { describe, expect, test } from "bun:test";
import { createWorkingSet, scoreEntry, topPaths, touchPath } from "./workingSet.js";

describe("createWorkingSet", () => {
  test("starts with no entries and turn 0", () => {
    const ws = createWorkingSet();
    expect(ws.entries.size).toBe(0);
    expect(ws.turn).toBe(0);
  });

  test("accepts custom maxEntries", () => {
    const ws = createWorkingSet(5);
    expect(ws.maxEntries).toBe(5);
  });

  test("defaults maxEntries to 50", () => {
    const ws = createWorkingSet();
    expect(ws.maxEntries).toBe(50);
  });
});

describe("touchPath", () => {
  test("adds a new path with touches=1 on first touch", () => {
    const ws = createWorkingSet();
    touchPath(ws, "src/index.ts");
    expect(ws.entries.get("src/index.ts")?.touches).toBe(1);
  });

  test("increments touches on revisit", () => {
    const ws = createWorkingSet();
    touchPath(ws, "src/foo.ts");
    touchPath(ws, "src/foo.ts");
    touchPath(ws, "src/foo.ts");
    expect(ws.entries.get("src/foo.ts")?.touches).toBe(3);
  });

  test("sets lastTurn to ws.turn at time of touch", () => {
    const ws = createWorkingSet();
    ws.turn = 5;
    touchPath(ws, "src/bar.ts");
    expect(ws.entries.get("src/bar.ts")?.lastTurn).toBe(5);
  });

  test("updates lastTurn on revisit", () => {
    const ws = createWorkingSet();
    ws.turn = 1;
    touchPath(ws, "src/a.ts");
    ws.turn = 7;
    touchPath(ws, "src/a.ts");
    expect(ws.entries.get("src/a.ts")?.lastTurn).toBe(7);
  });

  test("prunes to maxEntries when exceeded, evicting lowest score", () => {
    const ws = createWorkingSet(3);
    // touch "hot" path many times so it has high score
    for (let i = 0; i < 10; i++) touchPath(ws, "src/hot.ts");
    touchPath(ws, "src/medium.ts");
    touchPath(ws, "src/medium.ts");
    touchPath(ws, "src/cold.ts"); // lowest score: touches=1

    // now add a 4th path — should evict src/cold.ts
    touchPath(ws, "src/new.ts");

    expect(ws.entries.size).toBe(3);
    expect(ws.entries.has("src/cold.ts")).toBe(false);
    expect(ws.entries.has("src/hot.ts")).toBe(true);
  });
});

describe("scoreEntry", () => {
  test("higher touch count produces higher score (same recency)", () => {
    const a = { path: "a", touches: 5, lastTurn: 3 };
    const b = { path: "b", touches: 2, lastTurn: 3 };
    expect(scoreEntry(a, 3)).toBeGreaterThan(scoreEntry(b, 3));
  });

  test("more recent path produces higher score (same touches)", () => {
    const recent = { path: "r", touches: 1, lastTurn: 10 };
    const old = { path: "o", touches: 1, lastTurn: 1 };
    expect(scoreEntry(recent, 10)).toBeGreaterThan(scoreEntry(old, 10));
  });

  test("score is non-negative", () => {
    const entry = { path: "x", touches: 1, lastTurn: 0 };
    expect(scoreEntry(entry, 1000)).toBeGreaterThanOrEqual(0);
  });
});

describe("topPaths", () => {
  test("returns at most max paths", () => {
    const ws = createWorkingSet();
    touchPath(ws, "a.ts");
    touchPath(ws, "b.ts");
    touchPath(ws, "c.ts");
    expect(topPaths(ws, 2)).toHaveLength(2);
  });

  test("returns all paths when fewer than max", () => {
    const ws = createWorkingSet();
    touchPath(ws, "a.ts");
    expect(topPaths(ws, 10)).toHaveLength(1);
  });

  test("returns most-touched path first", () => {
    const ws = createWorkingSet();
    touchPath(ws, "rarely.ts");
    for (let i = 0; i < 5; i++) touchPath(ws, "often.ts");
    const paths = topPaths(ws, 2);
    expect(paths[0]).toBe("often.ts");
  });

  test("returns empty array when no entries", () => {
    const ws = createWorkingSet();
    expect(topPaths(ws, 5)).toEqual([]);
  });
});
