# Research: WebSearch + WebFetch Tools

## Decision 1: Model call pattern for `web_fetch`

**Decision**: Non-streaming `client.messages.create()` via `ToolContext`

**Rationale**: All three existing subagent tools (`fast_query`, `vision_analyze`, `deep_reasoning`) use non-streaming calls for tool sub-calls. The constitution's "Streaming Always" principle applies only to the outer ReAct loop in `runLoop`. Sub-calls from within tools are explicitly non-streaming.

**Pattern** (from `packages/core/src/tools/subagent.ts`):
```ts
const response = await context.client.messages.create({
  model: context.modelConfig.fastModel,
  max_tokens: 2048,
  messages: [{ role: "user", content: pageMarkdown }],
});
const result = response.content
  .filter((b) => b.type === "text")
  .map((b) => b.text)
  .join("\n");
```

**ToolContext wiring** (`packages/core/src/agent/agent.ts` line ~190):
```ts
const toolContext: ToolContext = {
  sessionId,
  storage,
  client: this.client,
  modelConfig: this.modelConfig,  // has fastModel, defaultModel, etc.
};
```

**Fallback**: If `context` is undefined, return truncated raw Markdown (tool called outside agent).

---

## Decision 2: Config extension pattern

**Decision**: Add `SearchConfig` interface + `search` field to `ChloeConfig` using existing `section()` helper.

**Rationale**: The `section(raw, "key")` helper in `config.ts` (lines 87–92) already handles missing TOML sections by returning `{}`, so an absent `[search]` block falls through cleanly to the default.

**Minimal additions to `config.ts`**:
1. `SearchConfig` interface: `{ provider: string; braveApiKey?: string }`
2. `search: SearchConfig` in `ChloeConfig`
3. `searchProvider: "duckduckgo"` in `DEFAULTS`
4. In `loadConfigFrom`: extract `fileSearch = section(raw, "search")`, derive `searchProvider` via env → TOML → default, return `search: { provider: searchProvider }`.

**TOML mapping**: `[search]\nprovider = "duckduckgo"` (optional — default used when absent).

---

## Decision 3: Tool registration pattern

**Decision**: Factory function closing over `SearchConfig` at construction time; passed through `createDefaultTools()`.

**Rationale**: All existing tools use factory functions (`createBashTool`, `createReadFileTool`, etc.) that capture config in closures. `ToolContext` (execution-time) only carries session/LLM concerns. Construction-time closure is the established pattern.

**Wiring change**: `createDefaultTools()` in `packages/core/src/tools/index.ts` gains an optional `searchConfig?: SearchConfig` param. In `agent.ts`, this is sourced from `config.search`.

---

## Decision 4: DuckDuckGo HTTP approach

**Decision**: POST to `https://html.duckduckgo.com/html/` with form body, parse HTML response.

**Rationale**: This is the same endpoint `ddgs` uses. No API key required. Pure Bun `fetch` — zero Python dependency.

**Request**:
```
POST https://html.duckduckgo.com/html/
Content-Type: application/x-www-form-urlencoded
User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36
Body: q=<query>&l=us-en&kp=-1
```

**Response parsing**: HTML with `div.result` containers.
- Title: `.result__a` text content
- URL: `.result__a` href, decoded from DDG redirect (`/l/?uddg=<encoded-url>`)
- Snippet: `.result__snippet` text content

**URL decoding**: DDG redirect URLs start with `/l/?uddg=`. Extract and `decodeURIComponent` the `uddg` param. Filter out `https://duckduckgo.com/y.js?` spam URLs.

**Risk**: DDG may rate-limit or change HTML structure. Mitigated by provider abstraction — swap to Brave via config if needed.

---

## Decision 5: HTML→Markdown pipeline

**Decision**: `node-html-parser` (parse) + `turndown` (convert) as npm dependencies.

**Rationale**: Both are pure JS/TS, Bun-compatible, lightweight. `node-html-parser` is faster than cheerio; `turndown` is the standard HTML→MD converter.

**Pipeline**: `fetch(url)` → raw HTML → `node-html-parser` strip `<script>/<style>` → `turndown` → Markdown string → truncate at 50,000 chars → model (if `process: true`).

---

## Alternatives Considered

| Topic | Alternative | Rejected Because |
|-------|-------------|-----------------|
| Model calls | Streaming via `context.client.messages.stream()` | Constitution streaming clause is for outer loop only; streaming adds complexity with no benefit for tool sub-calls |
| Config | New env var `CHLOE_SEARCH_PROVIDER` | Still need config; env var added as override layer per existing pattern |
| DuckDuckGo | Official Instant Answer API (`api.duckduckgo.com`) | Returns factual snippets, not a list of web results |
| HTML parsing | `cheerio` | Heavier dependency; `node-html-parser` is sufficient |
| HTML parsing | `@mozilla/readability` | Requires JSDOM (heavy); `node-html-parser` + `turndown` covers the use case |
