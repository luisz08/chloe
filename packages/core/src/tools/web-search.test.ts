import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { createWebSearchTool } from "./web-search.js";

function buildHtml(count: number): string {
  const divs = Array.from(
    { length: count },
    (_, i) => `
    <div class="result">
      <a class="result__a" href="https://example.com/${i + 1}">Result ${i + 1}</a>
      <div class="result__snippet">Snippet ${i + 1}</div>
    </div>`,
  ).join("");
  return `<html><body><div class="results">${divs}</div></body></html>`;
}

let originalFetch: typeof fetch;

beforeEach(() => {
  originalFetch = global.fetch;
});

afterEach(() => {
  global.fetch = originalFetch;
});

function mockFetchWithHtml(html: string): void {
  global.fetch = mock(() =>
    Promise.resolve({
      text: () => Promise.resolve(html),
      ok: true,
      status: 200,
    } as Response),
  ) as unknown as typeof fetch;
}

describe("createWebSearchTool", () => {
  const searchConfig = { provider: "duckduckgo" };

  describe("returns JSON array of results", () => {
    it("returns a JSON string of results from the provider", async () => {
      mockFetchWithHtml(buildHtml(5));

      const tool = createWebSearchTool(searchConfig);
      const output = await tool.execute({ query: "hello world" });

      const parsed = JSON.parse(output) as Array<{ title: string; url: string; snippet: string }>;
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed.length).toBe(5);
      expect(parsed[0]).toHaveProperty("title");
      expect(parsed[0]).toHaveProperty("url");
      expect(parsed[0]).toHaveProperty("snippet");
    });
  });

  describe("empty query handling", () => {
    it("returns error string when query is empty string", async () => {
      const tool = createWebSearchTool(searchConfig);
      const output = await tool.execute({ query: "" });

      expect(output).toContain("Error");
    });

    it("returns error string when query is whitespace only", async () => {
      const tool = createWebSearchTool(searchConfig);
      const output = await tool.execute({ query: "   " });

      expect(output).toContain("Error");
    });
  });

  describe("max_results clamping", () => {
    it("clamps max_results to 20 when a larger value is provided", async () => {
      mockFetchWithHtml(buildHtml(25));

      const tool = createWebSearchTool(searchConfig);
      const output = await tool.execute({ query: "test", max_results: 50 });

      const parsed = JSON.parse(output) as Array<unknown>;
      expect(parsed.length).toBeLessThanOrEqual(20);
    });

    it("clamps max_results to at least 1 when 0 is provided", async () => {
      mockFetchWithHtml(buildHtml(5));

      const tool = createWebSearchTool(searchConfig);
      const output = await tool.execute({ query: "test", max_results: 0 });

      const parsed = JSON.parse(output) as Array<unknown>;
      expect(parsed.length).toBeGreaterThanOrEqual(1);
    });

    it("uses default of 5 when max_results is omitted", async () => {
      mockFetchWithHtml(buildHtml(10));

      const tool = createWebSearchTool(searchConfig);
      const output = await tool.execute({ query: "test" });

      const parsed = JSON.parse(output) as Array<unknown>;
      expect(parsed.length).toBe(5);
    });
  });
});
