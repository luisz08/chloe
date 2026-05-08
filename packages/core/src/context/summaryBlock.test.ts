import { describe, expect, test } from "bun:test";
import { buildSummarySystem, stripLegacyXmlWrapper } from "./summaryBlock.js";

describe("buildSummarySystem", () => {
  test("output contains the summary text", () => {
    const result = buildSummarySystem("Agent fixed the bug in loop.ts.", []);
    expect(result).toContain("Agent fixed the bug in loop.ts.");
  });

  test("output contains a heading", () => {
    const result = buildSummarySystem("some summary", []);
    expect(result).toContain("##");
  });

  test("output includes file paths when provided", () => {
    const result = buildSummarySystem("summary", ["src/foo.ts", "packages/core/src/bar.ts"]);
    expect(result).toContain("src/foo.ts");
    expect(result).toContain("packages/core/src/bar.ts");
  });

  test("output does not error when paths list is empty", () => {
    expect(() => buildSummarySystem("summary", [])).not.toThrow();
  });

  test("output contains a resume note", () => {
    const result = buildSummarySystem("summary", []);
    expect(result.toLowerCase()).toContain("compacted");
  });
});

describe("stripLegacyXmlWrapper", () => {
  test("strips <context_summary> wrapper", () => {
    const input = "<context_summary>this is the summary text</context_summary>";
    expect(stripLegacyXmlWrapper(input)).toBe("this is the summary text");
  });

  test("strips wrapper with surrounding whitespace", () => {
    const input = "<context_summary>\n  summary content\n</context_summary>";
    expect(stripLegacyXmlWrapper(input).trim()).toBe("summary content");
  });

  test("is a no-op on plain text", () => {
    const input = "plain summary without xml";
    expect(stripLegacyXmlWrapper(input)).toBe(input);
  });

  test("is a no-op on empty string", () => {
    expect(stripLegacyXmlWrapper("")).toBe("");
  });

  test("handles partial tag (no-op)", () => {
    const input = "<context_summary>no closing tag";
    expect(stripLegacyXmlWrapper(input)).toBe(input);
  });
});
