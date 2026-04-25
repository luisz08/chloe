import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { BraveProvider } from "./brave.js";

interface BraveMockResult {
  title: string;
  url: string;
  description?: string;
}

function buildBraveResponse(results: BraveMockResult[]) {
  return JSON.stringify({ web: { results } });
}

let originalFetch: typeof fetch;

beforeEach(() => {
  originalFetch = global.fetch;
});

afterEach(() => {
  global.fetch = originalFetch;
});

function mockBraveFetch(body: string, status = 200): void {
  global.fetch = mock(() =>
    Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(JSON.parse(body)),
    } as unknown as Response),
  ) as unknown as typeof fetch;
}

describe("BraveProvider", () => {
  describe("normal results", () => {
    it("returns SearchResult[] mapped from Brave API response", async () => {
      mockBraveFetch(
        buildBraveResponse([
          { title: "Result 1", url: "https://example.com/1", description: "Snippet 1" },
          { title: "Result 2", url: "https://example.com/2", description: "Snippet 2" },
          { title: "Result 3", url: "https://example.com/3", description: "Snippet 3" },
        ]),
      );

      const provider = new BraveProvider("test-api-key");
      const results = await provider.search("test query");

      expect(results).toHaveLength(3);
      expect(results[0]).toEqual({
        title: "Result 1",
        url: "https://example.com/1",
        snippet: "Snippet 1",
      });
    });

    it("defaults snippet to empty string when description is missing", async () => {
      mockBraveFetch(buildBraveResponse([{ title: "No Desc", url: "https://example.com/nodesc" }]));

      const provider = new BraveProvider("test-api-key");
      const results = await provider.search("test");

      expect(results[0]?.snippet).toBe("");
    });

    it("sends X-Subscription-Token header with API key", async () => {
      let capturedHeaders: Record<string, string> = {};
      global.fetch = mock((_, init: RequestInit) => {
        capturedHeaders = Object.fromEntries(
          Object.entries(init?.headers ?? {}) as Array<[string, string]>,
        );
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ web: { results: [] } }),
        } as unknown as Response);
      }) as unknown as typeof fetch;

      const provider = new BraveProvider("my-secret-key");
      await provider.search("test");

      expect(capturedHeaders["X-Subscription-Token"]).toBe("my-secret-key");
    });
  });

  describe("maxResults clamping", () => {
    it("returns at most maxResults items", async () => {
      const many = Array.from({ length: 10 }, (_, i) => ({
        title: `R${i}`,
        url: `https://example.com/${i}`,
        description: `Snippet ${i}`,
      }));
      mockBraveFetch(buildBraveResponse(many));

      const provider = new BraveProvider("key");
      const results = await provider.search("test", { maxResults: 3 });

      expect(results).toHaveLength(3);
    });

    it("clamps maxResults to 20", async () => {
      const many = Array.from({ length: 25 }, (_, i) => ({
        title: `R${i}`,
        url: `https://example.com/${i}`,
      }));
      mockBraveFetch(buildBraveResponse(many));

      const provider = new BraveProvider("key");
      const results = await provider.search("test", { maxResults: 25 });

      expect(results).toHaveLength(20);
    });
  });

  describe("API error handling", () => {
    it("throws when API returns non-200 status", async () => {
      mockBraveFetch("{}", 401);

      const provider = new BraveProvider("bad-key");
      expect(provider.search("test")).rejects.toThrow("401");
    });
  });

  describe("empty response", () => {
    it("returns empty array when web.results is missing", async () => {
      mockBraveFetch(JSON.stringify({}));

      const provider = new BraveProvider("key");
      const results = await provider.search("test");

      expect(results).toEqual([]);
    });
  });
});
