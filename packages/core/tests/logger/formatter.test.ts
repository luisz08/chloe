import { describe, expect, it } from "bun:test";
import { formatLine } from "../../src/logger/formatter.js";

describe("formatLine", () => {
  it("produces a line with ISO UTC timestamp, padded level, component, and message", () => {
    const line = formatLine("info", "agent", "run started");
    // timestamp: 24-char ISO string ending in Z
    expect(line).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z \[INFO \] agent: run started$/,
    );
  });

  it("pads DEBUG to 5 chars", () => {
    const line = formatLine("debug", "loop", "msg");
    expect(line).toContain("[DEBUG]");
  });

  it("pads WARN to 5 chars", () => {
    const line = formatLine("warn", "loop", "msg");
    expect(line).toContain("[WARN ]");
  });

  it("pads ERROR to 5 chars", () => {
    const line = formatLine("error", "loop", "msg");
    expect(line).toContain("[ERROR]");
  });

  it("appends key=value fields after the message", () => {
    const line = formatLine("info", "agent", "run started", { session: "abc123", model: "test" });
    expect(line).toContain("session=abc123");
    expect(line).toContain("model=test");
  });

  it("quotes string field values that contain spaces", () => {
    const line = formatLine("error", "loop", "tool error", { error: "execution timeout" });
    expect(line).toContain('error="execution timeout"');
  });

  it("does not quote string field values without spaces", () => {
    const line = formatLine("info", "agent", "done", { session: "abc" });
    expect(line).toContain("session=abc");
    expect(line).not.toContain('"abc"');
  });

  it("renders numeric field values without quotes", () => {
    const line = formatLine("info", "agent", "done", { elapsed_ms: 1977 });
    expect(line).toContain("elapsed_ms=1977");
  });

  it("renders boolean field values without quotes", () => {
    const line = formatLine("debug", "loop", "denied", { confirmed: false });
    expect(line).toContain("confirmed=false");
  });

  it("truncates field values longer than 200 chars", () => {
    const long = "x".repeat(300);
    const line = formatLine("info", "loop", "tool call", { input: long });
    const match = line.match(/input=(\S+)/);
    expect(match).not.toBeNull();
    if (match) {
      expect(match[1]?.length ?? 0).toBeLessThanOrEqual(200);
    }
  });

  it("produces no trailing whitespace when fields is undefined", () => {
    const line = formatLine("info", "agent", "hello");
    expect(line).not.toMatch(/ $/);
  });

  it("produces no trailing whitespace when fields is empty", () => {
    const line = formatLine("info", "agent", "hello", {});
    expect(line).not.toMatch(/ $/);
  });
});
