import { describe, expect, test } from "bun:test";
import { generateSessionId } from "./id.js";

describe("generateSessionId", () => {
  test("returns correct format (YYYYMMDDHHmmss-xxxxxxx)", () => {
    const id = generateSessionId();

    // Check total length (22 chars)
    expect(id.length).toBe(22);

    // Check format: 14-digit timestamp + hyphen + 7-char random
    const pattern = /^[0-9]{14}-[a-z0-9]{7}$/;
    expect(pattern.test(id)).toBe(true);
  });

  test("timestamp portion reflects current time", () => {
    const before = new Date();
    const id = generateSessionId();
    const after = new Date();

    const timestampPart = id.slice(0, 14);

    // Parse timestamp from ID
    const year = Number(timestampPart.slice(0, 4));
    const month = Number(timestampPart.slice(4, 6));
    const day = Number(timestampPart.slice(6, 8));
    const hours = Number(timestampPart.slice(8, 10));
    const minutes = Number(timestampPart.slice(10, 12));
    const seconds = Number(timestampPart.slice(12, 14));

    const idDate = new Date(year, month - 1, day, hours, minutes, seconds);

    // ID timestamp should be within 1 second of test execution
    expect(idDate.getTime()).toBeGreaterThanOrEqual(before.getTime() - 1000);
    expect(idDate.getTime()).toBeLessThanOrEqual(after.getTime() + 1000);
  });

  test("generates unique IDs on multiple calls", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      ids.add(generateSessionId());
    }
    expect(ids.size).toBe(100);
  });

  test("random suffix is lowercase alphanumeric", () => {
    const id = generateSessionId();
    const randomPart = id.slice(15); // after hyphen

    expect(randomPart.length).toBe(7);
    expect(/^[a-z0-9]+$/.test(randomPart)).toBe(true);
  });
});
