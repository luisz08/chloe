import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createReadFileTool } from "./read-file.js";
import type { ToolSettings } from "./settings.js";

const TMP = join(import.meta.dir, "__fixtures_rf__");
const SETTINGS: ToolSettings = {
  allowedPaths: [TMP],
  bash: { allowedCommands: [], timeoutMs: 30000, maxOutputBytes: 32768 },
  readFile: { maxOutputBytes: 32768 },
};

beforeAll(() => {
  mkdirSync(TMP, { recursive: true });
  writeFileSync(join(TMP, "hello.txt"), "line1\nline2\nline3\n", "utf-8");
  // Large file: 1000 lines of ~100 chars each ≈ 100KB (exceeds 32KB limit)
  const bigContent = Array.from(
    { length: 1000 },
    (_, i) => `Line ${String(i + 1).padStart(4)}: ${"x".repeat(80)}`,
  ).join("\n");
  writeFileSync(join(TMP, "big.txt"), bigContent, "utf-8");
});

afterAll(() => rmSync(TMP, { recursive: true, force: true }));

describe("ReadFileTool", () => {
  const tool = createReadFileTool(SETTINGS, TMP);

  it("returns numbered lines for a small file", async () => {
    const out = await tool.execute({ path: "hello.txt" });
    expect(out).toContain("1\tline1");
    expect(out).toContain("2\tline2");
    expect(out).toContain("3\tline3");
  });

  it("supports offset and limit", async () => {
    const out = await tool.execute({ path: "hello.txt", offset: 2, limit: 1 });
    expect(out).toContain("2\tline2");
    expect(out).not.toContain("1\tline1");
    expect(out).not.toContain("3\tline3");
  });

  it("truncates large files and appends notice", async () => {
    const out = await tool.execute({ path: "big.txt" });
    expect(out).toContain("[output truncated:");
    expect(out).toContain("use offset/limit to read more");
  });

  it("returns error for non-existent file", async () => {
    const out = await tool.execute({ path: "missing.txt" });
    expect(out).toMatch(/File not found/);
  });

  it("returns error for path outside allowed dirs", async () => {
    const out = await tool.execute({ path: "/etc/passwd" });
    expect(out).toMatch(/Access denied/);
  });

  it("has correct tool name", () => {
    expect(tool.name).toBe("read_file");
  });
});
