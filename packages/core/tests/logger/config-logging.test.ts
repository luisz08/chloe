import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const TMP = join(import.meta.dir, "__tmp_config_logging__");
const CONFIG_FILE = join(TMP, "config.toml");

beforeEach(() => {
  mkdirSync(TMP, { recursive: true });
  // Clear env overrides
  process.env.CHLOE_LOG_DIR = undefined;
  process.env.CHLOE_LOG_LEVEL = undefined;
});

afterEach(() => {
  rmSync(TMP, { recursive: true, force: true });
  process.env.CHLOE_LOG_DIR = undefined;
  process.env.CHLOE_LOG_LEVEL = undefined;
});

// Dynamically import loadConfig so we can change env vars between tests
async function load(configPath: string) {
  const mod = await import("../../src/config.js");
  return mod.loadConfigFrom(configPath);
}

describe("loadConfig — logging defaults", () => {
  it("returns default logging config when no [logging] section in file", async () => {
    writeFileSync(CONFIG_FILE, '[provider]\napi_key = "key"\n');
    const cfg = await load(CONFIG_FILE);
    expect(cfg.logging.level).toBe("info");
    expect(cfg.logging.maxSizeMb).toBe(10);
    expect(cfg.logging.maxDays).toBe(7);
    expect(cfg.logging.logDir).toBe(resolve(process.cwd(), "logs"));
  });

  it("reads log_dir, level, max_size_mb, max_days from config file", async () => {
    writeFileSync(
      CONFIG_FILE,
      `[provider]\napi_key = "key"\n[logging]\nlog_dir = "${TMP}"\nlevel = "debug"\nmax_size_mb = 5\nmax_days = 3\n`,
    );
    const cfg = await load(CONFIG_FILE);
    expect(cfg.logging.logDir).toBe(TMP);
    expect(cfg.logging.level).toBe("debug");
    expect(cfg.logging.maxSizeMb).toBe(5);
    expect(cfg.logging.maxDays).toBe(3);
  });

  it("CHLOE_LOG_DIR env var overrides config file", async () => {
    writeFileSync(CONFIG_FILE, '[provider]\napi_key = "key"\n');
    process.env.CHLOE_LOG_DIR = TMP;
    const cfg = await load(CONFIG_FILE);
    expect(cfg.logging.logDir).toBe(TMP);
  });

  it("CHLOE_LOG_LEVEL env var overrides config file", async () => {
    writeFileSync(CONFIG_FILE, '[provider]\napi_key = "key"\n[logging]\nlevel = "info"\n');
    process.env.CHLOE_LOG_LEVEL = "warn";
    const cfg = await load(CONFIG_FILE);
    expect(cfg.logging.level).toBe("warn");
  });

  it("resolves relative log_dir against cwd", async () => {
    writeFileSync(CONFIG_FILE, '[provider]\napi_key = "key"\n[logging]\nlog_dir = "./my-logs"\n');
    const cfg = await load(CONFIG_FILE);
    expect(cfg.logging.logDir).toBe(resolve(process.cwd(), "my-logs"));
  });

  it("expands ~ in log_dir", async () => {
    writeFileSync(
      CONFIG_FILE,
      '[provider]\napi_key = "key"\n[logging]\nlog_dir = "~/.chloe/logs"\n',
    );
    const cfg = await load(CONFIG_FILE);
    expect(cfg.logging.logDir).not.toContain("~");
    expect(cfg.logging.logDir).toContain(".chloe/logs");
  });
});
