export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface SearchOptions {
  maxResults?: number;
  notify?: (message: string) => void;
}

export interface SearchProvider {
  search(query: string, options: SearchOptions): Promise<SearchResult[]>;
}
