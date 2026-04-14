import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { ToolSettings } from "../../src/tools/settings.js";
import { createWriteFileTool } from "../../src/tools/write-file.js";

const TMP = join(import.meta.dir, "__fixtures_wf__");
const SETTINGS: ToolSettings = {
  allowedPaths: [TMP],
  bash: { allowedCommands: [], timeoutMs: 30000, maxOutputBytes: 32768 },
  readFile: { maxOutputBytes: 32768 },
};

beforeAll(() => mkdirSync(TMP, { recursive: true }));
afterAll(() => rmSync(TMP, { recursive: true, force: true }));

describe("WriteFileTool", () => {
  const tool = createWriteFileTool(SETTINGS, TMP);

  it("writes a new file and returns byte count", async () => {
    const out = await tool.execute({ path: "output.txt", content: "Hello, world!\n" });
    expect(out).toMatch(/Written \d+ bytes to output\.txt/);
    expect(readFileSync(join(TMP, "output.txt"), "utf-8")).toBe("Hello, world!\n");
  });

  it("overwrites an existing file", async () => {
    await tool.execute({ path: "output.txt", content: "first" });
    const out = await tool.execute({ path: "output.txt", content: "second" });
    expect(out).toMatch(/Written/);
    expect(readFileSync(join(TMP, "output.txt"), "utf-8")).toBe("second");
  });

  it("auto-creates parent directories", async () => {
    const out = await tool.execute({ path: "nested/deep/file.txt", content: "hi" });
    expect(out).toMatch(/Written/);
    expect(readFileSync(join(TMP, "nested/deep/file.txt"), "utf-8")).toBe("hi");
  });

  it("returns error for path outside allowed dirs", async () => {
    const out = await tool.execute({ path: "/etc/evil.txt", content: "bad" });
    expect(out).toMatch(/Access denied/);
  });

  it("has correct tool name", () => {
    expect(tool.name).toBe("write_file");
  });

  it("response is one line (no content echoed back)", async () => {
    const out = await tool.execute({ path: "check.txt", content: "test" });
    expect(out.split("\n").filter(Boolean)).toHaveLength(1);
  });
});
