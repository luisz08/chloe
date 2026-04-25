import type { SearchOptions, SearchProvider, SearchResult } from "../types.js";

export class BraveProvider implements SearchProvider {
  async search(_query: string, _options: SearchOptions = {}): Promise<SearchResult[]> {
    throw new Error(
      "Brave Search provider not yet implemented. Set [search] provider = 'duckduckgo' in config.",
    );
  }
}
