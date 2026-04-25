export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface SearchOptions {
  maxResults?: number;
}

export interface SearchProvider {
  search(query: string, options: SearchOptions): Promise<SearchResult[]>;
}
