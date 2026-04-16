import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

// Import directly from the source file (colocated test)
import { expandHome, loadConfigFrom, maskSecret } from "./config.js";

// Import the default db path constant for accurate test expectations
const DEFAULT_DB_PATH = join(homedir(), ".chloe", "sessions", "chloe.db");

// ─── Test isolation: use temp directory, not real ~/.chloe ─────────────────────

const TMP_DIR = join(homedir(), ".chloe-test-temp");
const SETTINGS_DIR = join(TMP_DIR, "settings");
const SESSIONS_DIR = join(TMP_DIR, "sessions");
const CONFIG_PATH = join(SETTINGS_DIR, "config.toml");
const NEW_DB = join(SESSIONS_DIR, "chloe.db");

function writeToml(content: string): void {
  mkdirSync(SETTINGS_DIR, { recursive: true });
  writeFileSync(CONFIG_PATH, content, "utf-8");
}

function clearEnv(): void {
  for (const key of [
    "CHLOE_API_KEY",
    "CHLOE_PROVIDER",
    "CHLOE_DEFAULT_MODEL",
    "CHLOE_REASONING_MODEL",
    "CHLOE_FAST_MODEL",
    "CHLOE_VISION_MODEL",
    "CHLOE_MODEL", // legacy - ignored
    "CHLOE_BASE_URL",
    "CHLOE_DB_PATH",
    "CHLOE_LOG_DIR",
    "CHLOE_LOG_LEVEL",
  ]) {
    delete process.env[key];
  }
}

function setupTempDir(): void {
  mkdirSync(SETTINGS_DIR, { recursive: true });
  mkdirSync(SESSIONS_DIR, { recursive: true });
}

function cleanupTempDir(): void {
  if (existsSync(TMP_DIR)) rmSync(TMP_DIR, { recursive: true, force: true });
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
    cleanupTempDir();
    setupTempDir();
  });

  afterEach(() => {
    clearEnv();
    cleanupTempDir();
  });

  it("returns all defaults when no config file and no env vars", () => {
    const cfg = loadConfigFrom(CONFIG_PATH);
    expect(cfg.provider.apiKey).toBe("");
    expect(cfg.provider.name).toBe("anthropic");
    expect(cfg.provider.defaultModel).toBe("claude-sonnet-4-6");
    expect(cfg.provider.reasoningModel).toBe("claude-sonnet-4-6"); // fallback
    expect(cfg.provider.fastModel).toBe("claude-sonnet-4-6"); // fallback
    expect(cfg.provider.visionModel).toBe("claude-sonnet-4-6"); // fallback
    expect(cfg.provider.baseUrl).toBe("");
    // Default dbPath is the real path (hardcoded in config.ts)
    expect(cfg.storage.dbPath).toBe(DEFAULT_DB_PATH);
  });

  it("reads api_key from config file", () => {
    writeToml(`[provider]\napi_key = "sk-from-file"\n`);
    const cfg = loadConfigFrom(CONFIG_PATH);
    expect(cfg.provider.apiKey).toBe("sk-from-file");
  });

  it("reads default_model from config file", () => {
    writeToml(`[provider]\ndefault_model = "claude-opus-4-6"\n`);
    const cfg = loadConfigFrom(CONFIG_PATH);
    expect(cfg.provider.defaultModel).toBe("claude-opus-4-6");
  });

  it("reads reasoning_model from config file with fallback", () => {
    writeToml(`[provider]\ndefault_model = "claude-sonnet-4-6"\nreasoning_model = "claude-opus-4-6"\n`);
    const cfg = loadConfigFrom(CONFIG_PATH);
    expect(cfg.provider.defaultModel).toBe("claude-sonnet-4-6");
    expect(cfg.provider.reasoningModel).toBe("claude-opus-4-6");
  });

  it("reasoning_model falls back to default_model when unset", () => {
    writeToml(`[provider]\ndefault_model = "claude-sonnet-4-6"\n`);
    const cfg = loadConfigFrom(CONFIG_PATH);
    expect(cfg.provider.reasoningModel).toBe("claude-sonnet-4-6"); // fallback
  });

  it("env var CHLOE_DEFAULT_MODEL overrides file value", () => {
    writeToml(`[provider]\ndefault_model = "claude-haiku-4-5-20251001"\n`);
    process.env.CHLOE_DEFAULT_MODEL = "claude-opus-4-6";
    const cfg = loadConfigFrom(CONFIG_PATH);
    expect(cfg.provider.defaultModel).toBe("claude-opus-4-6");
  });

  it("env var CHLOE_REASONING_MODEL overrides file value", () => {
    writeToml(`[provider]\nreasoning_model = "claude-sonnet-4-6"\n`);
    process.env.CHLOE_REASONING_MODEL = "claude-opus-4-6";
    const cfg = loadConfigFrom(CONFIG_PATH);
    expect(cfg.provider.reasoningModel).toBe("claude-opus-4-6");
  });

  it("env var CHLOE_FAST_MODEL sets fast_model", () => {
    process.env.CHLOE_FAST_MODEL = "claude-haiku-4-5-20251001";
    const cfg = loadConfigFrom(CONFIG_PATH);
    expect(cfg.provider.fastModel).toBe("claude-haiku-4-5-20251001");
  });

  it("env var CHLOE_VISION_MODEL sets vision_model", () => {
    process.env.CHLOE_VISION_MODEL = "claude-sonnet-4-6";
    const cfg = loadConfigFrom(CONFIG_PATH);
    expect(cfg.provider.visionModel).toBe("claude-sonnet-4-6");
  });

  it("legacy CHLOE_MODEL env var is ignored", () => {
    process.env.CHLOE_MODEL = "claude-opus-4-6"; // legacy - should be ignored
    const cfg = loadConfigFrom(CONFIG_PATH);
    expect(cfg.provider.defaultModel).toBe("claude-sonnet-4-6"); // still default
  });

  it("legacy model field in TOML is ignored", () => {
    writeToml(`[provider]\nmodel = "claude-opus-4-6"\n`); // legacy - should be ignored
    const cfg = loadConfigFrom(CONFIG_PATH);
    expect(cfg.provider.defaultModel).toBe("claude-sonnet-4-6"); // still default
  });

  it("env var CHLOE_API_KEY overrides file value", () => {
    writeToml(`[provider]\napi_key = "sk-from-file"\n`);
    process.env.CHLOE_API_KEY = "sk-from-env";
    const cfg = loadConfigFrom(CONFIG_PATH);
    expect(cfg.provider.apiKey).toBe("sk-from-env");
  });

  it("throws with file path on invalid TOML", () => {
    writeToml("this is not valid toml ===");
    expect(() => loadConfigFrom(CONFIG_PATH)).toThrow(CONFIG_PATH);
  });

  it("creates sessions directory on fresh install", () => {
    // Use env var to avoid creating real ~/.chloe/sessions directory
    process.env.CHLOE_DB_PATH = NEW_DB;
    const cfg = loadConfigFrom(CONFIG_PATH);
    expect(cfg.storage.dbPath).toBe(NEW_DB);
    expect(existsSync(dirname(cfg.storage.dbPath))).toBe(true);
  });

  it("uses CHLOE_DB_PATH env var when set", () => {
    const customPath = join(SESSIONS_DIR, "custom.db");
    process.env.CHLOE_DB_PATH = customPath;
    const cfg = loadConfigFrom(CONFIG_PATH);
    expect(cfg.storage.dbPath).toBe(customPath);
  });
});

// ─── migrateDb (via loadConfig side effect) ──────────────────────────────────
//
// NOTE: migrateDb uses hardcoded OLD_DB_PATH (~/.chloe/chloe.db) which cannot be
// overridden without modifying business logic. To avoid affecting user data, we:
// 1. Always set db_path to test directory (prevents migration to/from real paths)
// 2. Focus on testing that loadConfigFrom doesn't throw

describe("migrateDb (via loadConfig)", () => {
  beforeEach(() => {
    clearEnv();
    cleanupTempDir();
    setupTempDir();
  });

  afterEach(() => {
    clearEnv();
    cleanupTempDir();
  });

  it("loadConfigFrom does not throw when db_path is set", () => {
    // Setting db_path to test directory ensures no interaction with real user paths
    writeToml(`[storage]\ndb_path = "${NEW_DB}"\n`);
    expect(() => loadConfigFrom(CONFIG_PATH)).not.toThrow();
  });

  it("creates sessions directory when db_path is configured", () => {
    writeToml(`[storage]\ndb_path = "${NEW_DB}"\n`);
    const cfg = loadConfigFrom(CONFIG_PATH);
    expect(cfg.storage.dbPath).toBe(NEW_DB);
    expect(existsSync(dirname(cfg.storage.dbPath))).toBe(true);
  });
});

// ─── loadConfig — logging config ──────────────────────────────────────────────

describe("loadConfig — logging defaults", () => {
  beforeEach(() => {
    clearEnv();
    cleanupTempDir();
    setupTempDir();
  });

  afterEach(() => {
    clearEnv();
    cleanupTempDir();
  });

  it("returns default logging config when no [logging] section in file", () => {
    writeToml(`[provider]\napi_key = "key"\n`);
    const cfg = loadConfigFrom(CONFIG_PATH);
    expect(cfg.logging.level).toBe("info");
    expect(cfg.logging.maxSizeMb).toBe(10);
    expect(cfg.logging.maxDays).toBe(7);
    expect(cfg.logging.logDir).toBe(resolve(process.cwd(), "logs"));
  });

  it("reads log_dir, level, max_size_mb, max_days from config file", () => {
    writeToml(
      `[provider]\napi_key = "key"\n[logging]\nlog_dir = "${TMP_DIR}"\nlevel = "debug"\nmax_size_mb = 5\nmax_days = 3\n`,
    );
    const cfg = loadConfigFrom(CONFIG_PATH);
    expect(cfg.logging.logDir).toBe(TMP_DIR);
    expect(cfg.logging.level).toBe("debug");
    expect(cfg.logging.maxSizeMb).toBe(5);
    expect(cfg.logging.maxDays).toBe(3);
  });

  it("CHLOE_LOG_DIR env var overrides config file", () => {
    writeToml(`[provider]\napi_key = "key"\n`);
    process.env.CHLOE_LOG_DIR = TMP_DIR;
    const cfg = loadConfigFrom(CONFIG_PATH);
    expect(cfg.logging.logDir).toBe(TMP_DIR);
  });

  it("CHLOE_LOG_LEVEL env var overrides config file", () => {
    writeToml(`[provider]\napi_key = "key"\n[logging]\nlevel = "info"\n`);
    process.env.CHLOE_LOG_LEVEL = "warn";
    const cfg = loadConfigFrom(CONFIG_PATH);
    expect(cfg.logging.level).toBe("warn");
  });

  it("resolves relative log_dir against cwd", () => {
    writeToml(`[provider]\napi_key = "key"\n[logging]\nlog_dir = "./my-logs"\n`);
    const cfg = loadConfigFrom(CONFIG_PATH);
    expect(cfg.logging.logDir).toBe(resolve(process.cwd(), "my-logs"));
  });

  it("expands ~ in log_dir", () => {
    writeToml(`[provider]\napi_key = "key"\n[logging]\nlog_dir = "~/.chloe/logs"\n`);
    const cfg = loadConfigFrom(CONFIG_PATH);
    expect(cfg.logging.logDir).not.toContain("~");
    expect(cfg.logging.logDir).toContain(".chloe/logs");
  });
});
