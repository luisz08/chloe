import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const TMP = join(import.meta.dir, "__tmp_logger__");

beforeEach(() => {
  mkdirSync(TMP, { recursive: true });
});

afterEach(() => {
  rmSync(TMP, { recursive: true, force: true });
});

// Re-import fresh each time by resetting module cache via dynamic import
async function freshLogger() {
  // Bun caches modules — use a workaround: import the module and reset the singleton
  const mod = await import("./logger.js");
  mod.resetLogger(); // test-only escape hatch
  return mod;
}

describe("CoreLogger — level filtering", () => {
  it("suppresses debug messages when level is info", async () => {
    const { initLogger, getLogger } = await freshLogger();
    const written: string[] = [];
    const fakeSink = {
      write: (_l: unknown, _c: unknown, msg: string, _f?: unknown) => written.push(msg),
    };

    initLogger({ logDir: TMP, level: "info", maxSizeMb: 10, maxDays: 7 }, fakeSink);
    getLogger().debug("should be suppressed");
    getLogger().info("should appear");

    expect(written).toEqual(["should appear"]);
  });

  it("suppresses info and debug when level is warn", async () => {
    const { initLogger, getLogger } = await freshLogger();
    const written: string[] = [];
    const fakeSink = {
      write: (_l: unknown, _c: unknown, msg: string, _f?: unknown) => written.push(msg),
    };

    initLogger({ logDir: TMP, level: "warn", maxSizeMb: 10, maxDays: 7 }, fakeSink);
    getLogger().debug("no");
    getLogger().info("no");
    getLogger().warn("yes");
    getLogger().error("yes");

    expect(written).toEqual(["yes", "yes"]);
  });

  it("passes all levels when level is debug", async () => {
    const { initLogger, getLogger } = await freshLogger();
    const written: string[] = [];
    const fakeSink = {
      write: (_l: unknown, _c: unknown, msg: string, _f?: unknown) => written.push(msg),
    };

    initLogger({ logDir: TMP, level: "debug", maxSizeMb: 10, maxDays: 7 }, fakeSink);
    getLogger().debug("a");
    getLogger().info("b");
    getLogger().warn("c");
    getLogger().error("d");

    expect(written).toEqual(["a", "b", "c", "d"]);
  });
});

describe("getLogger before initLogger", () => {
  it("returns a no-op logger that never throws", async () => {
    const { getLogger, resetLogger } = await freshLogger();
    resetLogger();

    expect(() => {
      getLogger().debug("x");
      getLogger().info("x");
      getLogger().warn("x");
      getLogger().error("x");
    }).not.toThrow();
  });
});

describe("pruning on initLogger", () => {
  it("deletes log files older than maxDays", async () => {
    const { initLogger } = await freshLogger();

    // Create a stale file (mtime = 10 days ago)
    const stale = join(TMP, "chloe-2020-01-01.log");
    writeFileSync(stale, "old");
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    utimesSync(stale, tenDaysAgo, tenDaysAgo);

    initLogger({ logDir: TMP, level: "info", maxSizeMb: 10, maxDays: 7 });

    expect(existsSync(stale)).toBe(false);
  });

  it("keeps log files within the retention window", async () => {
    const { initLogger } = await freshLogger();

    const recent = join(TMP, "chloe-2099-01-01.log");
    writeFileSync(recent, "new");

    initLogger({ logDir: TMP, level: "info", maxSizeMb: 10, maxDays: 7 });

    expect(existsSync(recent)).toBe(true);
  });

  it("ignores non-log files in logDir during pruning", async () => {
    const { initLogger } = await freshLogger();

    const other = join(TMP, "readme.txt");
    writeFileSync(other, "not a log");
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    utimesSync(other, tenDaysAgo, tenDaysAgo);

    initLogger({ logDir: TMP, level: "info", maxSizeMb: 10, maxDays: 7 });

    expect(existsSync(other)).toBe(true);
  });
});
