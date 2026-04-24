# Data Model: WebSearch + WebFetch Tools

## Entities

### SearchProvider (interface)

```ts
interface SearchProvider {
  search(query: string, options: SearchOptions): Promise<SearchResult[]>;
}
```

- Implemented by `DuckDuckGoProvider`; future: `BraveProvider`, `TavilyProvider`
- Stateless — no session state

### SearchResult

```ts
interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}
```

- Plain data object; no validation rules beyond non-empty strings
- Returned by `SearchProvider.search()`

### SearchOptions

```ts
interface SearchOptions {
  maxResults?: number;  // default 5, max 20
}
```

### SearchConfig

```ts
interface SearchConfig {
  provider: string;       // "duckduckgo" | "brave" | future values
  braveApiKey?: string;   // required when provider = "brave"
}
```

- Lives in `ChloeConfig.search`
- TOML section: `[search]`

## Config Extension

### ChloeConfig (extended)

```ts
interface ChloeConfig {
  provider: ProviderConfig;
  storage: StorageConfig;
  logging: LoggingConfig;
  contextCompression: ContextCompressionConfig;
  search: SearchConfig;   // NEW
}
```

### TOML representation

```toml
[search]
provider = "duckduckgo"   # optional — default when absent
# brave_api_key = "..."   # only needed for Brave provider
```

## Module Layout

```
packages/core/src/
├── search/
│   ├── types.ts               # SearchProvider, SearchResult, SearchOptions
│   ├── providers/
│   │   ├── duckduckgo.ts      # DuckDuckGoProvider implements SearchProvider
│   │   └── brave.ts           # BraveProvider stub (throws "not implemented")
│   └── index.ts               # getSearchProvider(config: SearchConfig): SearchProvider
└── tools/
    ├── web-search.ts           # createWebSearchTool(config: SearchConfig): Tool
    └── web-fetch.ts            # createWebFetchTool(): Tool
```

## Tool Input Schemas

### web_search

```ts
{
  type: "object",
  properties: {
    query:       { type: "string",  description: "Search query" },
    max_results: { type: "number",  description: "Max results (default 5, max 20)" },
  },
  required: ["query"],
}
```

### web_fetch

```ts
{
  type: "object",
  properties: {
    url:     { type: "string",  description: "URL to fetch" },
    process: { type: "boolean", description: "Process with fast model (default true)" },
    prompt:  { type: "string",  description: "Model prompt (default: summarize)" },
  },
  required: ["url"],
}
```

## State Transitions

No persistent state — both tools are stateless request/response. No storage adapter usage. Tool calls are not persisted as subagent sessions (unlike `subagent.ts`).
