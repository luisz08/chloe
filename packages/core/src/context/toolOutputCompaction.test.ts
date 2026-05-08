import { describe, expect, test } from "bun:test";
import { NOISY_TOOLS, compactToolOutput, defaultToolOutputLimits } from "./toolOutputCompaction.js";

describe("defaultToolOutputLimits", () => {
  test("returns expected defaults", () => {
    const limits = defaultToolOutputLimits();
    expect(limits.hardLimitChars).toBe(12_000);
    expect(limits.noisySoftLimitChars).toBe(2_000);
    expect(limits.snippetChars).toBe(900);
  });
});

describe("NOISY_TOOLS", () => {
  test("includes bash, web_search, web_fetch", () => {
    expect(NOISY_TOOLS.has("bash")).toBe(true);
    expect(NOISY_TOOLS.has("web_search")).toBe(true);
    expect(NOISY_TOOLS.has("web_fetch")).toBe(true);
  });

  test("does not include non-noisy tools", () => {
    expect(NOISY_TOOLS.has("read_file")).toBe(false);
    expect(NOISY_TOOLS.has("write_file")).toBe(false);
  });
});

describe("compactToolOutput", () => {
  test("returns output unchanged when below hard limit", () => {
    const raw = "a".repeat(100);
    expect(compactToolOutput("read_file", raw)).toBe(raw);
  });

  test("returns output unchanged when exactly at hard limit", () => {
    const raw = "a".repeat(12_000);
    expect(compactToolOutput("read_file", raw)).toBe(raw);
  });

  test("trims output above hard limit for non-noisy tool", () => {
    const raw = "a".repeat(12_001);
    const result = compactToolOutput("read_file", raw);
    expect(result.length).toBeLessThan(raw.length);
    expect(result).toContain("[read_file output trimmed");
  });

  test("trims bash output above noisy soft limit", () => {
    const raw = "b".repeat(2_001);
    const result = compactToolOutput("bash", raw);
    expect(result).toContain("[bash output trimmed");
  });

  test("does NOT trim bash output below noisy soft limit", () => {
    const raw = "b".repeat(2_000);
    expect(compactToolOutput("bash", raw)).toBe(raw);
  });

  test("snippet preserves head and tail of original", () => {
    const head = "HEAD_CONTENT";
    const middle = "x".repeat(13_000);
    const tail = "TAIL_CONTENT";
    const raw = head + middle + tail;
    const result = compactToolOutput("read_file", raw);
    expect(result).toContain(head);
    expect(result).toContain(tail);
  });

  test("trimmed output contains original length info", () => {
    const raw = "z".repeat(15_000);
    const result = compactToolOutput("read_file", raw);
    expect(result).toContain("15000");
  });

  test("accepts custom limits", () => {
    const raw = "c".repeat(500);
    const customLimits = { hardLimitChars: 100, noisySoftLimitChars: 50, snippetChars: 20 };
    const result = compactToolOutput("read_file", raw, customLimits);
    expect(result).toContain("[read_file output trimmed");
  });

  test("empty output is returned unchanged", () => {
    expect(compactToolOutput("bash", "")).toBe("");
  });
});
