import { parse } from "node-html-parser";
import type { SearchOptions, SearchProvider, SearchResult } from "../types.js";

const DDG_URL = "https://html.duckduckgo.com/html/";
const DEFAULT_MAX_RESULTS = 5;
const MAX_RESULTS_LIMIT = 20;

function decodeDdgUrl(href: string): string {
  if (!href.includes("/l/?") && !href.startsWith("/l/")) return href;

  try {
    const urlPart = href.startsWith("http") ? href : `https://duckduckgo.com${href}`;
    const url = new URL(urlPart);
    const uddg = url.searchParams.get("uddg");
    if (uddg) return decodeURIComponent(uddg);
  } catch {
    // Fall through and return original
  }

  return href;
}

export class DuckDuckGoProvider implements SearchProvider {
  async search(query: string, options: SearchOptions = {}): Promise<SearchResult[]> {
    const maxResults = Math.min(
      Math.max(1, options.maxResults ?? DEFAULT_MAX_RESULTS),
      MAX_RESULTS_LIMIT,
    );

    const body = new URLSearchParams({
      q: query,
      l: "us-en",
      kp: "-1",
    });

    const response = await fetch(DDG_URL, {
      method: "POST",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept-Language": "en-US,en;q=0.5",
      },
      body: body.toString(),
    });

    const html = await response.text();
    const root = parse(html);

    const results: SearchResult[] = [];

    for (const container of root.querySelectorAll(".result")) {
      const anchorEl = container.querySelector(".result__a");
      if (!anchorEl) continue;

      const title = anchorEl.text.trim();
      const rawHref = anchorEl.getAttribute("href") ?? "";
      const url = decodeDdgUrl(rawHref);

      if (!url || url.includes("duckduckgo.com/y.js")) continue;

      const snippetEl = container.querySelector(".result__snippet");
      const snippet = snippetEl ? snippetEl.text.trim() : "";

      results.push({ title, url, snippet });

      if (results.length >= maxResults) break;
    }

    return results;
  }
}
