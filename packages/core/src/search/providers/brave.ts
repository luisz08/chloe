import type { SearchOptions, SearchProvider, SearchResult } from "../types.js";

const BRAVE_SEARCH_URL = "https://api.search.brave.com/res/v1/web/search";
const DEFAULT_MAX_RESULTS = 5;
const MAX_RESULTS_LIMIT = 20;

interface BraveSearchResult {
  title: string;
  url: string;
  description?: string;
}

interface BraveSearchResponse {
  web?: {
    results?: BraveSearchResult[];
  };
}

export class BraveProvider implements SearchProvider {
  constructor(private readonly apiKey: string) {}

  async search(query: string, options: SearchOptions = {}): Promise<SearchResult[]> {
    const maxResults = Math.min(
      Math.max(1, options.maxResults ?? DEFAULT_MAX_RESULTS),
      MAX_RESULTS_LIMIT,
    );

    const params = new URLSearchParams({
      q: query,
      count: String(maxResults),
      search_lang: "en",
      country: "us",
      safesearch: "moderate",
    });

    const response = await fetch(`${BRAVE_SEARCH_URL}?${params}`, {
      headers: {
        "X-Subscription-Token": this.apiKey,
        Accept: "application/json",
        "Accept-Encoding": "gzip",
      },
    });

    if (!response.ok) {
      throw new Error(`Brave Search API error: HTTP ${response.status}`);
    }

    const data = (await response.json()) as BraveSearchResponse;
    const raw = data.web?.results ?? [];

    return raw.slice(0, maxResults).map((r) => ({
      title: r.title,
      url: r.url,
      snippet: r.description ?? "",
    }));
  }
}
