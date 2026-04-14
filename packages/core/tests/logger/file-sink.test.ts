import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { FileSink } from "../../src/logger/file-sink.js";

const TMP = join(import.meta.dir, "__tmp_filesink__");

beforeEach(() => {
  mkdirSync(TMP, { recursive: true });
});

afterEach(() => {
  rmSync(TMP, { recursive: true, force: true });
});

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

describe("FileSink", () => {
  it("creates the log file and writes a line on first write", () => {
    const sink = new FileSink({ logDir: TMP, maxSizeMb: 10 });
    sink.write("info", "test", "hello");

    const logFile = join(TMP, `chloe-${today()}.log`);
    expect(existsSync(logFile)).toBe(true);
    const content = readFileSync(logFile, "utf-8");
    expect(content).toContain("[INFO ] test: hello");
  });

  it("appends multiple lines to the same file", () => {
    const sink = new FileSink({ logDir: TMP, maxSizeMb: 10 });
    sink.write("info", "test", "line one");
    sink.write("debug", "test", "line two");

    const logFile = join(TMP, `chloe-${today()}.log`);
    const content = readFileSync(logFile, "utf-8");
    expect(content).toContain("line one");
    expect(content).toContain("line two");
    expect(content.split("\n").filter(Boolean)).toHaveLength(2);
  });

  it("rotates the file when it exceeds maxSizeMb", () => {
    const logFile = join(TMP, `chloe-${today()}.log`);
    // Pre-fill to just over 1 byte limit (0.000001 MB = 1 byte)
    writeFileSync(logFile, "x".repeat(1024 * 1024)); // 1 MB exactly

    const sink = new FileSink({ logDir: TMP, maxSizeMb: 1 }); // threshold = 1 MB
    sink.write("info", "test", "triggers rotation");

    const rotated = join(TMP, `chloe-${today()}.1.log`);
    expect(existsSync(rotated)).toBe(true);
    expect(statSync(rotated).size).toBe(1024 * 1024);

    // New active file contains only the new line
    const content = readFileSync(logFile, "utf-8");
    expect(content).toContain("triggers rotation");
  });

  it("uses incrementing N for multiple rotations on the same day", () => {
    const logFile = join(TMP, `chloe-${today()}.log`);
    writeFileSync(logFile, "x".repeat(1024 * 1024));

    const sink = new FileSink({ logDir: TMP, maxSizeMb: 1 });
    sink.write("info", "test", "first rotation");

    // Refill to trigger second rotation
    writeFileSync(logFile, "x".repeat(1024 * 1024));
    sink.write("info", "test", "second rotation");

    expect(existsSync(join(TMP, `chloe-${today()}.1.log`))).toBe(true);
    expect(existsSync(join(TMP, `chloe-${today()}.2.log`))).toBe(true);
  });

  it("writes fields to the log line", () => {
    const sink = new FileSink({ logDir: TMP, maxSizeMb: 10 });
    sink.write("error", "loop", "tool error", { tool: "echo", error: "timeout" });

    const logFile = join(TMP, `chloe-${today()}.log`);
    const content = readFileSync(logFile, "utf-8");
    expect(content).toContain("tool=echo");
    expect(content).toContain("error=timeout");
  });
});
