import type { SearchConfig } from "../config.js";
import { BraveProvider } from "./providers/brave.js";
import { DuckDuckGoProvider } from "./providers/duckduckgo.js";
import type { SearchProvider } from "./types.js";

export type { SearchOptions, SearchProvider, SearchResult } from "./types.js";

export function getSearchProvider(config: SearchConfig): SearchProvider {
  switch (config.provider) {
    case "brave": {
      if (!config.braveApiKey) {
        throw new Error(
          "Brave Search requires a brave_api_key in config or CHLOE_BRAVE_API_KEY env var.",
        );
      }
      return new BraveProvider(config.braveApiKey);
    }
    case "duckduckgo":
      return new DuckDuckGoProvider();
    default:
      return new DuckDuckGoProvider();
  }
}
