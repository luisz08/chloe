import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { DuckDuckGoProvider } from "./duckduckgo.js";

// Reflects current DDG HTML structure: titles in <h2>, URL display in result__url,
// snippet optionally in .result__snippet or <p>.
function buildDdgHtml(results: Array<{ title: string; href: string; snippet?: string }>): string {
  const items = results
    .map(
      ({ title, href, snippet }) => `
    <div class="result-wrapper">
      <h2 style="font-size:large"><a href="${href}">${title}</a></h2>
      <div class="result">
        <a class="result__url" href="${href}">example.com</a>
        ${snippet ? `<p>${snippet}</p>` : ""}
      </div>
    </div>`,
    )
    .join("\n");
  return `<html><body>${items}</body></html>`;
}

const MINIMAL_HTML = buildDdgHtml([
  {
    title: "First Result",
    href: "/l/?uddg=https%3A%2F%2Fexample.com%2Fpage1",
    snippet: "Snippet for first result",
  },
  {
    title: "Second Result",
    href: "/l/?uddg=https%3A%2F%2Fexample.com%2Fpage2",
    snippet: "Snippet for second result",
  },
  {
    title: "Third Result",
    href: "/l/?uddg=https%3A%2F%2Fexample.com%2Fpage3",
    snippet: "Snippet for third result",
  },
  {
    title: "Fourth Result",
    href: "/l/?uddg=https%3A%2F%2Fexample.com%2Fpage4",
    snippet: "Snippet for fourth result",
  },
  {
    title: "Fifth Result",
    href: "/l/?uddg=https%3A%2F%2Fexample.com%2Fpage5",
    snippet: "Snippet for fifth result",
  },
  {
    title: "Sixth Result",
    href: "/l/?uddg=https%3A%2F%2Fexample.com%2Fpage6",
    snippet: "Snippet for sixth result",
  },
]);

// DDG redirect URL that needs decoding
const DDG_REDIRECT_HTML = buildDdgHtml([
  {
    title: "Redirected Result",
    href: "/l/?uddg=https%3A%2F%2Fwww.real-site.com%2Farticle",
    snippet: "A snippet for redirected result",
  },
]);

// Mix of y.js ad URL and a valid result
const YJS_FILTER_HTML = `
<html><body>
  <div class="result-wrapper">
    <h2><a href="https://duckduckgo.com/y.js?ad_domain=example.com">Ad Result</a></h2>
    <div class="result"><p>Ad snippet</p></div>
  </div>
  <div class="result-wrapper">
    <h2><a href="/l/?uddg=https%3A%2F%2Fexample.com%2Fvalid">Valid Result</a></h2>
    <div class="result"><p>Valid snippet</p></div>
  </div>
</body></html>`;

// Verify result__url links (NOT in <h2>) are ignored as titles
const URL_DISPLAY_ONLY_HTML = `
<html><body>
  <div class="result-wrapper">
    <h2><a href="/l/?uddg=https%3A%2F%2Fexample.com%2Freal">Real Title</a></h2>
    <div class="result">
      <a class="result__url" href="/l/?uddg=https%3A%2F%2Fexample.com%2Freal">example.com</a>
      <p>Snippet text</p>
    </div>
  </div>
</body></html>`;

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

    it("does not treat result__url anchors as titles", async () => {
      mockFetchWithHtml(URL_DISPLAY_ONLY_HTML);

      const provider = new DuckDuckGoProvider();
      const results = await provider.search("test");

      expect(results).toHaveLength(1);
      // biome-ignore lint/style/noNonNullAssertion: length asserted above
      expect(results[0]!.title).toBe("Real Title");
      // biome-ignore lint/style/noNonNullAssertion: length asserted above
      expect(results[0]!.url).toBe("https://example.com/real");
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
      const manyResults = Array.from({ length: 25 }, (_, i) => ({
        title: `Result ${i + 1}`,
        href: `/l/?uddg=https%3A%2F%2Fexample.com%2Fpage${i + 1}`,
        snippet: `Snippet ${i + 1}`,
      }));

      mockFetchWithHtml(buildDdgHtml(manyResults));

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

  describe("bot-challenge detection", () => {
    it("throws when DDG returns 202 bot-challenge page", async () => {
      global.fetch = mock(() =>
        Promise.resolve({
          ok: false,
          status: 202,
          text: () => Promise.resolve("<html><body>anomaly challenge</body></html>"),
        } as unknown as Response),
      ) as unknown as typeof fetch;

      const provider = new DuckDuckGoProvider();
      expect(provider.search("test")).rejects.toThrow("202");
    });
  });
});
