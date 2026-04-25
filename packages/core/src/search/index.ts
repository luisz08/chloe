import type { SearchConfig } from "../config.js";
import { BraveProvider } from "./providers/brave.js";
import { DuckDuckGoProvider } from "./providers/duckduckgo.js";
import type { SearchProvider } from "./types.js";

export type { SearchOptions, SearchProvider, SearchResult } from "./types.js";

export function getSearchProvider(config: SearchConfig): SearchProvider {
  switch (config.provider) {
    case "brave":
      return new BraveProvider();
    case "duckduckgo":
      return new DuckDuckGoProvider();
    default:
      return new DuckDuckGoProvider();
  }
}
