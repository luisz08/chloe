import { describe, expect, test } from "bun:test";
import { slugify, validateSessionId } from "./slug.js";

describe("slugify", () => {
  test("basic string is slugified (My Project → my-project)", () => {
    expect(slugify("My Project")).toBe("my-project");
  });

  test("consecutive hyphens are collapsed", () => {
    expect(slugify("hello---world")).toBe("hello-world");
    expect(slugify("foo  bar")).toBe("foo-bar");
  });

  test("special chars are replaced with hyphens", () => {
    expect(slugify("hello@world!")).toBe("hello-world");
    expect(slugify("foo/bar/baz")).toBe("foo-bar-baz");
    expect(slugify("hello_world")).toBe("hello-world");
  });

  test("leading and trailing hyphens are trimmed", () => {
    expect(slugify("--hello--")).toBe("hello");
    expect(slugify("!hello!")).toBe("hello");
  });

  test("empty string returns null", () => {
    expect(slugify("")).toBeNull();
  });

  test("string that produces empty result after processing returns null", () => {
    expect(slugify("---")).toBeNull();
    expect(slugify("!!!")).toBeNull();
    expect(slugify("   ")).toBeNull();
  });

  test("string over 64 chars returns null", () => {
    const long = "a".repeat(65);
    expect(slugify(long)).toBeNull();
  });

  test("string of exactly 64 chars is valid", () => {
    const exact = "a".repeat(64);
    expect(slugify(exact)).toBe(exact);
  });
});

describe("validateSessionId", () => {
  test("valid slugs pass", () => {
    expect(validateSessionId("my-project")).toBe(true);
    expect(validateSessionId("hello-world-123")).toBe(true);
    expect(validateSessionId("a")).toBe(true);
    expect(validateSessionId("abc")).toBe(true);
    expect(validateSessionId("a1b2c3")).toBe(true);
  });

  test("single alphanumeric character passes", () => {
    expect(validateSessionId("a")).toBe(true);
    expect(validateSessionId("z")).toBe(true);
    expect(validateSessionId("0")).toBe(true);
    expect(validateSessionId("9")).toBe(true);
  });

  test("uppercase letters fail", () => {
    expect(validateSessionId("My-Project")).toBe(false);
    expect(validateSessionId("Hello")).toBe(false);
  });

  test("spaces fail", () => {
    expect(validateSessionId("my project")).toBe(false);
    expect(validateSessionId("hello world")).toBe(false);
  });

  test("leading hyphen fails", () => {
    expect(validateSessionId("-my-project")).toBe(false);
    expect(validateSessionId("-hello")).toBe(false);
  });

  test("trailing hyphen fails", () => {
    expect(validateSessionId("my-project-")).toBe(false);
  });

  test("empty string fails", () => {
    expect(validateSessionId("")).toBe(false);
  });

  test("id over 64 chars fails", () => {
    const long = "a".repeat(65);
    expect(validateSessionId(long)).toBe(false);
  });

  test("id of exactly 64 chars passes if valid", () => {
    const exact = "a".repeat(64);
    expect(validateSessionId(exact)).toBe(true);
  });

  test("single hyphen fails", () => {
    expect(validateSessionId("-")).toBe(false);
  });

  test("special characters fail", () => {
    expect(validateSessionId("hello@world")).toBe(false);
    expect(validateSessionId("foo/bar")).toBe(false);
  });
});
