import { describe, expect, test } from "bun:test";
import { getContextLimit } from "./models.js";

describe("getContextLimit", () => {
  test("T017: returns 200,000 for claude-opus-4-6", () => {
    expect(getContextLimit("claude-opus-4-6")).toBe(200_000);
  });

  test("T017: returns 200,000 for claude-sonnet-4-6", () => {
    expect(getContextLimit("claude-sonnet-4-6")).toBe(200_000);
  });

  test("T017: returns 200,000 for claude-haiku-4-5", () => {
    expect(getContextLimit("claude-haiku-4-5")).toBe(200_000);
  });

  test("T017: returns 200,000 for unknown model names (safe default)", () => {
    expect(getContextLimit("some-unknown-model")).toBe(200_000);
  });

  test("T017: returns 200,000 for custom/self-hosted model names", () => {
    expect(getContextLimit("my-custom-model-v1")).toBe(200_000);
  });

  test("T017: prefix matching works for model variants", () => {
    expect(getContextLimit("claude-sonnet-4-6-20251022")).toBe(200_000);
  });
});
