import type { SearchConfig } from "../config.js";
import { getSearchProvider } from "../search/index.js";
import type { Tool } from "./types.js";

const DEFAULT_MAX_RESULTS = 5;
const MAX_RESULTS_LIMIT = 20;

interface WebSearchInput {
  query: string;
  max_results?: number;
}

export function createWebSearchTool(searchConfig: SearchConfig): Tool {
  return {
    name: "web_search",
    description:
      "Search the web for information. Returns a list of results with title, URL, and snippet. " +
      "Use this to find current information, look up facts, or research topics.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The search query to look up on the web.",
        },
        max_results: {
          type: "number",
          description: `Maximum number of results to return (1–${MAX_RESULTS_LIMIT}). Defaults to ${DEFAULT_MAX_RESULTS}.`,
        },
      },
      required: ["query"],
    },
    async execute(input: unknown): Promise<string> {
      const { query, max_results } = input as WebSearchInput;

      if (!query || query.trim() === "") {
        return "Error: query must not be empty";
      }

      const maxResults =
        max_results !== undefined
          ? Math.min(Math.max(1, max_results), MAX_RESULTS_LIMIT)
          : DEFAULT_MAX_RESULTS;

      try {
        const provider = getSearchProvider(searchConfig);
        const results = await provider.search(query.trim(), { maxResults });
        return JSON.stringify(results);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return `Error: ${msg}`;
      }
    },
  };
}
