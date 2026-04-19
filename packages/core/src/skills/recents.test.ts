import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { addRecent, loadRecents, saveRecents } from "./recents.js";

describe("addRecent", () => {
  it("prepends a new name", () => {
    expect(addRecent(["b", "c"], "a")).toEqual(["a", "b", "c"]);
  });

  it("moves an existing name to front", () => {
    expect(addRecent(["a", "b", "c"], "b")).toEqual(["b", "a", "c"]);
  });

  it("truncates to limit", () => {
    const existing = Array.from({ length: 20 }, (_, i) => `s${i}`);
    const result = addRecent(existing, "new", 20);
    expect(result).toHaveLength(20);
    expect(result[0]).toBe("new");
  });
});

describe("loadRecents / saveRecents", () => {
  let filePath: string;

  beforeEach(() => {
    filePath = join(tmpdir(), `recents-${Math.random().toString(36).slice(2)}.json`);
  });

  afterEach(() => {
    rmSync(filePath, { force: true });
  });

  it("returns [] when file does not exist", () => {
    expect(loadRecents(filePath)).toEqual([]);
  });

  it("returns [] when file contains invalid JSON", () => {
    writeFileSync(filePath, "not json");
    expect(loadRecents(filePath)).toEqual([]);
  });

  it("round-trips save and load", () => {
    saveRecents(filePath, ["a", "b", "c"]);
    expect(loadRecents(filePath)).toEqual(["a", "b", "c"]);
  });
});
