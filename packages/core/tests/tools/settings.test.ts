import { describe, expect, it } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_TOOL_SETTINGS, loadToolSettings } from "../../src/tools/settings.js";

const TMP = join(import.meta.dir, "__fixtures__");

function writeSettings(obj: unknown): string {
  const dir = join(TMP, ".chloe");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "settings.json"), JSON.stringify(obj), "utf-8");
  return TMP;
}

function cleanup() {
  rmSync(TMP, { recursive: true, force: true });
}

describe("loadToolSettings", () => {
  it("returns defaults when no settings.json exists", () => {
    cleanup();
    const s = loadToolSettings(TMP);
    expect(s.allowedPaths).toEqual([TMP]);
    expect(s.bash.allowedCommands).toEqual([]);
    expect(s.bash.timeoutMs).toBe(30000);
    expect(s.bash.maxOutputBytes).toBe(32768);
    expect(s.readFile.maxOutputBytes).toBe(32768);
  });

  it("merges allowed_commands additively (does not override defaults)", () => {
    writeSettings({ tools: { bash: { allowed_commands: ["jq"] } } });
    const s = loadToolSettings(TMP);
    expect(s.bash.allowedCommands).toEqual(["jq"]);
    cleanup();
  });

  it("resolves allowed_paths relative to the given cwd", () => {
    writeSettings({ tools: { allowed_paths: ["./sub", "/abs/path"] } });
    const s = loadToolSettings(TMP);
    expect(s.allowedPaths).toContain(join(TMP, "sub"));
    expect(s.allowedPaths).toContain("/abs/path");
    cleanup();
  });

  it("expands ~ in allowed_paths", () => {
    writeSettings({ tools: { allowed_paths: ["~/notes"] } });
    const s = loadToolSettings(TMP);
    expect(s.allowedPaths[0]).not.toContain("~");
    cleanup();
  });

  it("falls back to defaults on malformed JSON and does not throw", () => {
    const dir = join(TMP, ".chloe");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "settings.json"), "{ bad json", "utf-8");
    const s = loadToolSettings(TMP);
    expect(s).toEqual(DEFAULT_TOOL_SETTINGS(TMP));
    cleanup();
  });

  it("falls back to defaults on missing tools section", () => {
    writeSettings({ other: "stuff" });
    const s = loadToolSettings(TMP);
    expect(s.bash.allowedCommands).toEqual([]);
    cleanup();
  });
});
