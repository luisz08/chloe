import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

// We import the internal helpers directly by path since they are not all exported
// from the package index yet. loadConfig reads from the real home dir, so we
// control the environment via env vars and temp files.
import { CONFIG_PATH, expandHome, loadConfig, maskSecret } from "../../packages/core/src/config.ts";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const OLD_DB = join(homedir(), ".chloe", "chloe.db");
const NEW_DB = join(homedir(), ".chloe", "sessions", "chloe.db");
const SETTINGS_DIR = join(homedir(), ".chloe", "settings");
const SESSIONS_DIR = join(homedir(), ".chloe", "sessions");

function writeToml(content: string): void {
  mkdirSync(SETTINGS_DIR, { recursive: true });
  writeFileSync(CONFIG_PATH, content, "utf-8");
}

function removeConfig(): void {
  if (existsSync(CONFIG_PATH)) rmSync(CONFIG_PATH);
}

function clearEnv(): void {
  for (const key of [
    "CHLOE_API_KEY",
    "CHLOE_PROVIDER",
    "CHLOE_MODEL",
    "CHLOE_BASE_URL",
    "CHLOE_DB_PATH",
  ]) {
    delete process.env[key];
  }
}

// ─── maskSecret ──────────────────────────────────────────────────────────────

describe("maskSecret", () => {
  it("masks long values: first 8 chars + ***", () => {
    expect(maskSecret("sk-ant-abcdefghij")).toBe("sk-ant-a***");
  });

  it("masks values shorter than 8 chars as ***", () => {
    expect(maskSecret("short")).toBe("***");
  });

  it("masks exactly 8 chars: shows all 8 + ***", () => {
    expect(maskSecret("12345678")).toBe("12345678***");
  });

  it("masks empty string as ***", () => {
    expect(maskSecret("")).toBe("***");
  });
});

// ─── expandHome ──────────────────────────────────────────────────────────────

describe("expandHome", () => {
  it("expands ~/foo to homedir()/foo", () => {
    expect(expandHome("~/foo/bar")).toBe(join(homedir(), "foo/bar"));
  });

  it("expands bare ~ to homedir()", () => {
    expect(expandHome("~")).toBe(homedir());
  });

  it("leaves absolute paths unchanged", () => {
    expect(expandHome("/absolute/path")).toBe("/absolute/path");
  });
});

// ─── loadConfig ──────────────────────────────────────────────────────────────

describe("loadConfig", () => {
  beforeEach(() => {
    clearEnv();
    removeConfig();
  });

  afterEach(() => {
    clearEnv();
    removeConfig();
  });

  it("returns all defaults when no config file and no env vars", () => {
    const cfg = loadConfig();
    expect(cfg.provider.apiKey).toBe("");
    expect(cfg.provider.name).toBe("anthropic");
    expect(cfg.provider.model).toBe("claude-sonnet-4-6");
    expect(cfg.provider.baseUrl).toBe("");
    expect(cfg.storage.dbPath).toBe(NEW_DB);
  });

  it("reads api_key from config file", () => {
    writeToml(`[provider]\napi_key = "sk-from-file"\n`);
    const cfg = loadConfig();
    expect(cfg.provider.apiKey).toBe("sk-from-file");
  });

  it("reads model from config file", () => {
    writeToml(`[provider]\nmodel = "claude-opus-4-6"\n`);
    const cfg = loadConfig();
    expect(cfg.provider.model).toBe("claude-opus-4-6");
  });

  it("env var CHLOE_MODEL overrides file value", () => {
    writeToml(`[provider]\nmodel = "claude-haiku-4-5-20251001"\n`);
    process.env.CHLOE_MODEL = "claude-opus-4-6";
    const cfg = loadConfig();
    expect(cfg.provider.model).toBe("claude-opus-4-6");
  });

  it("env var CHLOE_API_KEY overrides file value", () => {
    writeToml(`[provider]\napi_key = "sk-from-file"\n`);
    process.env.CHLOE_API_KEY = "sk-from-env";
    const cfg = loadConfig();
    expect(cfg.provider.apiKey).toBe("sk-from-env");
  });

  it("throws with file path on invalid TOML", () => {
    writeToml("this is not valid toml ===");
    expect(() => loadConfig()).toThrow(CONFIG_PATH);
  });

  it("creates sessions directory on fresh install", () => {
    // Just verify loadConfig() doesn't throw and dbPath dir exists
    const cfg = loadConfig();
    expect(existsSync(dirname(cfg.storage.dbPath))).toBe(true);
  });

  it("uses CHLOE_DB_PATH env var when set", () => {
    const customPath = join(homedir(), ".chloe", "sessions", "custom.db");
    process.env.CHLOE_DB_PATH = customPath;
    const cfg = loadConfig();
    expect(cfg.storage.dbPath).toBe(customPath);
  });
});

// ─── migrateDb (via loadConfig side effect) ──────────────────────────────────

describe("migrateDb (via loadConfig)", () => {
  beforeEach(() => {
    clearEnv();
    removeConfig();
    // Remove both DB paths to start clean
    if (existsSync(OLD_DB)) rmSync(OLD_DB);
    if (existsSync(NEW_DB)) rmSync(NEW_DB);
  });

  afterEach(() => {
    clearEnv();
    removeConfig();
    if (existsSync(OLD_DB)) rmSync(OLD_DB);
    if (existsSync(NEW_DB)) rmSync(NEW_DB);
  });

  it("migrates old db to new path when only old exists", () => {
    mkdirSync(dirname(OLD_DB), { recursive: true });
    writeFileSync(OLD_DB, "fake-db-content", "utf-8");

    const consoleSpy = spyOn(console, "log");
    loadConfig();

    expect(existsSync(NEW_DB)).toBe(true);
    expect(existsSync(OLD_DB)).toBe(false);
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Migrated database"));
  });

  it("does not migrate when both paths exist", () => {
    mkdirSync(dirname(OLD_DB), { recursive: true });
    mkdirSync(SESSIONS_DIR, { recursive: true });
    writeFileSync(OLD_DB, "old-content", "utf-8");
    writeFileSync(NEW_DB, "new-content", "utf-8");

    loadConfig();

    // Both still exist, new path content unchanged
    expect(existsSync(OLD_DB)).toBe(true);
    expect(existsSync(NEW_DB)).toBe(true);
  });

  it("is a no-op when neither path exists", () => {
    // Should not throw
    expect(() => loadConfig()).not.toThrow();
    expect(existsSync(OLD_DB)).toBe(false);
  });
});
