import { describe, expect, it } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HookRegistry } from "./hooks.js";
import type { HookContext, HookEntry } from "./types.js";

function makeTmpDir(): string {
  const dir = join(tmpdir(), `chloe-hooks-test-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function makeEntry(override: Partial<HookEntry> = {}): HookEntry {
  return {
    event: "PostToolUse",
    type: "command",
    command: "true",
    pluginId: "test@marketplace",
    ...override,
  };
}

function makeCtx(override: Partial<HookContext> = {}): HookContext {
  return {
    event: "PostToolUse",
    sessionId: "sess-1",
    pluginRoot: "/tmp/fake-plugin",
    ...override,
  };
}

describe("HookRegistry", () => {
  it("register and registerAll add entries", () => {
    const registry = new HookRegistry();
    registry.register(makeEntry());
    registry.registerAll([makeEntry({ event: "SessionStart" })]);
    // fire() fires without throwing
    expect(() => registry.fire("PostToolUse", makeCtx())).not.toThrow();
  });

  it("fire is fire-and-forget (returns void synchronously)", () => {
    const registry = new HookRegistry();
    registry.register(makeEntry());
    const result = registry.fire("PostToolUse", makeCtx());
    expect(result).toBeUndefined();
  });

  it("does not fire hooks for wrong event", async () => {
    const tmpDir = makeTmpDir();
    const logFile = join(tmpDir, "ran.txt");
    const registry = new HookRegistry();
    registry.register(makeEntry({ event: "SessionStart", command: `touch ${logFile}` }));
    registry.fire("PostToolUse", makeCtx());
    await new Promise((r) => setTimeout(r, 200));
    const { existsSync } = await import("node:fs");
    expect(existsSync(logFile)).toBe(false);
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("fires matching hook and writes output", async () => {
    const tmpDir = makeTmpDir();
    const logFile = join(tmpDir, "ran.txt");
    const registry = new HookRegistry();
    registry.register(makeEntry({ command: `touch ${logFile}` }));
    registry.fire("PostToolUse", makeCtx());
    await new Promise((r) => setTimeout(r, 500));
    const { existsSync } = await import("node:fs");
    expect(existsSync(logFile)).toBe(true);
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("matcher filtering", () => {
    it("absent matcher matches all tools", async () => {
      const tmpDir = makeTmpDir();
      const logFile = join(tmpDir, "ran.txt");
      const registry = new HookRegistry();
      registry.register(makeEntry({ command: `touch ${logFile}` }));
      registry.fire("PostToolUse", makeCtx({ toolName: "write_file" }));
      await new Promise((r) => setTimeout(r, 500));
      const { existsSync } = await import("node:fs");
      expect(existsSync(logFile)).toBe(true);
      rmSync(tmpDir, { recursive: true, force: true });
    });

    it("wildcard matcher matches all tools", async () => {
      const tmpDir = makeTmpDir();
      const logFile = join(tmpDir, "ran.txt");
      const registry = new HookRegistry();
      registry.register(makeEntry({ command: `touch ${logFile}`, matcher: "*" }));
      registry.fire("PostToolUse", makeCtx({ toolName: "bash" }));
      await new Promise((r) => setTimeout(r, 500));
      const { existsSync } = await import("node:fs");
      expect(existsSync(logFile)).toBe(true);
      rmSync(tmpDir, { recursive: true, force: true });
    });

    it("exact matcher only matches specific tool", async () => {
      const tmpDir = makeTmpDir();
      const matchFile = join(tmpDir, "match.txt");
      const noMatchFile = join(tmpDir, "nomatch.txt");
      const registry = new HookRegistry();
      registry.register(makeEntry({ command: `touch ${matchFile}`, matcher: "write_file" }));
      registry.register(makeEntry({ command: `touch ${noMatchFile}`, matcher: "bash" }));
      registry.fire("PostToolUse", makeCtx({ toolName: "write_file" }));
      await new Promise((r) => setTimeout(r, 500));
      const { existsSync } = await import("node:fs");
      expect(existsSync(matchFile)).toBe(true);
      expect(existsSync(noMatchFile)).toBe(false);
      rmSync(tmpDir, { recursive: true, force: true });
    });
  });

  it("non-zero exit logs warning but does not throw", async () => {
    const registry = new HookRegistry();
    registry.register(makeEntry({ command: "exit 1" }));
    expect(() => registry.fire("PostToolUse", makeCtx())).not.toThrow();
    await new Promise((r) => setTimeout(r, 300));
  });

  it("substitutes CHLOE_PLUGIN_ROOT in command", async () => {
    const tmpDir = makeTmpDir();
    const logFile = join(tmpDir, "root.txt");
    // Create a fake plugin cache dir
    const pluginId = "testplugin@mkt";
    writeFileSync(logFile, "");
    const registry = new HookRegistry();
    // Command uses CHLOE_PLUGIN_ROOT env var (set via buildHookEnv)
    registry.register(
      makeEntry({
        command: `echo $CHLOE_PLUGIN_ROOT > ${logFile}`,
        pluginId,
      }),
    );
    registry.fire("PostToolUse", makeCtx());
    await new Promise((r) => setTimeout(r, 500));
    const content = (await import("node:fs")).readFileSync(logFile, "utf8").trim();
    expect(content.length).toBeGreaterThan(0);
    rmSync(tmpDir, { recursive: true, force: true });
  });
});
