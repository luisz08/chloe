import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { DuckDuckGoProvider } from "./duckduckgo.js";

const MINIMAL_HTML = `
<html>
<body>
<div class="results">
  <div class="result">
    <a class="result__a" href="https://example.com/page1">First Result</a>
    <div class="result__snippet">Snippet for first result</div>
  </div>
  <div class="result">
    <a class="result__a" href="https://example.com/page2">Second Result</a>
    <div class="result__snippet">Snippet for second result</div>
  </div>
  <div class="result">
    <a class="result__a" href="https://example.com/page3">Third Result</a>
    <div class="result__snippet">Snippet for third result</div>
  </div>
  <div class="result">
    <a class="result__a" href="https://example.com/page4">Fourth Result</a>
    <div class="result__snippet">Snippet for fourth result</div>
  </div>
  <div class="result">
    <a class="result__a" href="https://example.com/page5">Fifth Result</a>
    <div class="result__snippet">Snippet for fifth result</div>
  </div>
  <div class="result">
    <a class="result__a" href="https://example.com/page6">Sixth Result</a>
    <div class="result__snippet">Snippet for sixth result</div>
  </div>
</div>
</body>
</html>
`;

const DDG_REDIRECT_HTML = `
<html>
<body>
<div class="results">
  <div class="result">
    <a class="result__a" href="/l/?uddg=https%3A%2F%2Fwww.real-site.com%2Farticle">Redirected Result</a>
    <div class="result__snippet">A snippet for redirected result</div>
  </div>
</div>
</body>
</html>
`;

const YJS_FILTER_HTML = `
<html>
<body>
<div class="results">
  <div class="result">
    <a class="result__a" href="https://duckduckgo.com/y.js?ad_domain=example.com">Ad Result</a>
    <div class="result__snippet">Ad snippet</div>
  </div>
  <div class="result">
    <a class="result__a" href="https://example.com/valid">Valid Result</a>
    <div class="result__snippet">Valid snippet</div>
  </div>
</div>
</body>
</html>
`;

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

describe("DuckDuckGoProvider", () => {
  describe("normal HTML results", () => {
    it("returns correct SearchResult[] from HTML fixture", async () => {
      mockFetchWithHtml(MINIMAL_HTML);

      const provider = new DuckDuckGoProvider();
      const results = await provider.search("test query");

      expect(results).toHaveLength(5);
      expect(results[0]).toEqual({
        title: "First Result",
        url: "https://example.com/page1",
        snippet: "Snippet for first result",
      });
      expect(results[4]).toEqual({
        title: "Fifth Result",
        url: "https://example.com/page5",
        snippet: "Snippet for fifth result",
      });
    });
  });

  describe("DDG redirect URL decoding", () => {
    it("decodes /l/?uddg= redirect URLs to real URLs", async () => {
      mockFetchWithHtml(DDG_REDIRECT_HTML);

      const provider = new DuckDuckGoProvider();
      const results = await provider.search("test");

      expect(results).toHaveLength(1);
      // biome-ignore lint/style/noNonNullAssertion: length asserted above
      expect(results[0]!.url).toBe("https://www.real-site.com/article");
    });
  });

  describe("maxResults slicing", () => {
    it("returns at most maxResults items", async () => {
      mockFetchWithHtml(MINIMAL_HTML);

      const provider = new DuckDuckGoProvider();
      const results = await provider.search("test", { maxResults: 3 });

      expect(results).toHaveLength(3);
    });

    it("defaults to 5 results when maxResults is not specified", async () => {
      mockFetchWithHtml(MINIMAL_HTML);

      const provider = new DuckDuckGoProvider();
      const results = await provider.search("test");

      expect(results).toHaveLength(5);
    });

    it("clamps maxResults to 20", async () => {
      const manyResults = Array.from(
        { length: 25 },
        (_, i) => `
        <div class="result">
          <a class="result__a" href="https://example.com/page${i + 1}">Result ${i + 1}</a>
          <div class="result__snippet">Snippet ${i + 1}</div>
        </div>`,
      ).join("");

      mockFetchWithHtml(`<html><body><div class="results">${manyResults}</div></body></html>`);

      const provider = new DuckDuckGoProvider();
      const results = await provider.search("test", { maxResults: 25 });

      expect(results).toHaveLength(20);
    });
  });

  describe("y.js URL filtering", () => {
    it("filters out URLs containing duckduckgo.com/y.js", async () => {
      mockFetchWithHtml(YJS_FILTER_HTML);

      const provider = new DuckDuckGoProvider();
      const results = await provider.search("test");

      expect(results).toHaveLength(1);
      // biome-ignore lint/style/noNonNullAssertion: length asserted above
      expect(results[0]!.url).toBe("https://example.com/valid");
    });
  });
});
