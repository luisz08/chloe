# Tasks: WebSearch + WebFetch Tools

**Branch**: `015-web-search-fetch`
**Input**: `specs/015-web-search-fetch/` (spec.md, plan.md, research.md, data-model.md)

---

## Phase 1: Dependencies + Config (Shared Infrastructure)

**Purpose**: Install npm packages and extend config — blocks all tool implementation.

- [ ] T001 Add `node-html-parser`, `turndown`, `@types/turndown` to `packages/core/package.json` via `bun add`
- [ ] T002 Add `SearchConfig` interface to `packages/core/src/config.ts` (`{ provider: string; braveApiKey?: string }`)
- [ ] T003 Add `search: SearchConfig` field to `ChloeConfig` interface in `packages/core/src/config.ts`
- [ ] T004 Add `searchProvider: "duckduckgo"` to `DEFAULTS` in `packages/core/src/config.ts`
- [ ] T005 Extend `loadConfigFrom` in `packages/core/src/config.ts`: extract `fileSearch = section(raw, "search")`, derive `searchProvider` (env `CHLOE_SEARCH_PROVIDER` → TOML → default), return `search: { provider: searchProvider }`
- [ ] T006 Add config unit tests in `packages/core/src/config.test.ts`: (a) `[search]` section present, (b) `[search]` absent → default `"duckduckgo"`, (c) `CHLOE_SEARCH_PROVIDER` env override

**Checkpoint**: Config extension complete — search module and tools can now be built.

---

## Phase 2: Search Module (Foundational for `web_search`)

**Purpose**: `SearchProvider` interface + DuckDuckGo implementation — required before `web_search` tool.

- [ ] T007 Create `packages/core/src/search/types.ts` with `SearchResult`, `SearchOptions`, `SearchProvider` interface
- [ ] T008 Create `packages/core/src/search/providers/duckduckgo.ts` — `DuckDuckGoProvider` implementing `SearchProvider`:
  - POST `https://html.duckduckgo.com/html/` with `q=<query>&l=us-en&kp=-1`
  - Required headers: `User-Agent`, `Content-Type: application/x-www-form-urlencoded`
  - Parse HTML: `node-html-parser` selects `.result` containers → `.result__a` (title + href) + `.result__snippet`
  - Decode DDG redirect URLs: extract `uddg` param, `decodeURIComponent`; filter `duckduckgo.com/y.js?` URLs
  - Respect `maxResults` (default 5, clamp 1–20)
- [ ] T009 [P] Create `packages/core/src/search/providers/brave.ts` — `BraveProvider` stub that throws `"Brave Search provider not yet implemented"`
- [ ] T010 Create `packages/core/src/search/index.ts` — `getSearchProvider(config: SearchConfig): SearchProvider` factory (switch on `config.provider`)
- [ ] T011 Unit tests for `DuckDuckGoProvider`: mock `fetch` with fixture HTML, test result parsing, URL decoding, `maxResults` slicing
- [ ] T012 [P] Unit tests for `getSearchProvider`: returns `DuckDuckGoProvider` by default, returns stub for `"brave"`

---

## Phase 3: User Story 1 — `web_search` tool (Priority: P1) 🎯 MVP

**Goal**: Agent can call `web_search` to get a list of URLs + snippets for a query.

**Independent Test**: Call `web_search({ query: "bun 1.2 release" })` and verify it returns an array with `title`, `url`, `snippet` fields.

- [ ] T013 Create `packages/core/src/tools/web-search.ts` — `createWebSearchTool(searchConfig: SearchConfig): Tool`:
  - Input schema: `{ query: string, max_results?: number }`
  - Calls `getSearchProvider(searchConfig).search(query, { maxResults: max_results ?? 5 })`
  - Returns `JSON.stringify(results)`
  - Validates: `query` non-empty, clamp `max_results` to 1–20
- [ ] T014 [P] Unit tests for `web-search.ts`: mock provider, test normal response, test missing `query` error, test `max_results` clamping
- [ ] T015 Wire up in `packages/core/src/tools/index.ts` — add optional `searchConfig?: SearchConfig` param to `createDefaultTools()`; conditionally register `createWebSearchTool(searchConfig)` when provided
- [ ] T016 Modify `packages/core/src/agent/agent.ts` — pass `config.search` to `createDefaultTools()`

**Checkpoint**: `web_search` available to agent — US1 independently testable.

---

## Phase 4: User Story 2 — `web_fetch` tool (Priority: P2)

**Goal**: Agent can fetch a URL and get Markdown content, optionally processed by fast model with custom prompt.

**Independent Test**: Call `web_fetch({ url: "https://example.com", process: false })` and verify it returns Markdown content. Call with `process: true` and verify model output.

- [ ] T017 Create `packages/core/src/tools/web-fetch.ts` — `createWebFetchTool(): Tool`:
  - Input schema: `{ url: string, process?: boolean, prompt?: string }`
  - Fetch URL with `fetch()`, check `Content-Type` — reject non-HTML with descriptive error
  - Parse with `node-html-parser`, strip `<script>/<style>/<nav>/<footer>` nodes
  - Convert to Markdown with `turndown`
  - Truncate to 50,000 chars (FR-011)
  - If `process: false` → return Markdown directly (no model call)
  - If `process: true` OR `process` is omitted (default `true`) → call `context.client.messages.create({ model: context.modelConfig.fastModel, max_tokens: 2048, messages: [{ role: "user", content: resolvedPrompt + "\n\n" + markdown }] })`
  - Default prompt: `"Summarize the key information from this web page content concisely."`
  - Fallback when `context` is undefined: return raw truncated Markdown
- [ ] T018 [P] Unit tests for `web-fetch.ts`:
  - Mock `fetch` returning HTML fixture → verify Markdown output
  - `process: false` → returns Markdown, no model call
  - `process: true` without `prompt` → model called with default prompt
  - `process: true` with `prompt` → model called with custom prompt
  - Content > 50,000 chars → truncated
  - Non-HTML content-type → error returned
  - `context` undefined → raw Markdown fallback
- [ ] T019 Register `createWebFetchTool()` unconditionally in `createDefaultTools()` in `packages/core/src/tools/index.ts`

**Checkpoint**: `web_fetch` available to agent — US2 independently testable.

---

## Phase 5: User Story 3 — Provider configurability (Priority: P3)

**Goal**: Config `[search] provider = "duckduckgo"` works; interface ready for future providers.

**Independent Test**: Run with no `[search]` config → DuckDuckGo used. Interface allows Brave to be added without changing tool code.

- [ ] T020 [P] Verify `getSearchProvider` factory routes correctly (covered by T012; this is a validation task — confirm end-to-end with config wiring from T016)
- [ ] T021 [P] Add `brave_api_key` optional field handling in `loadConfigFrom` — extract `str(fileSearch.brave_api_key)` and pass to `SearchConfig`

---

## Phase 6: Quality Gates

- [ ] T022 Run `bunx biome check --error-on-warnings .` — fix all issues
- [ ] T023 Run `bunx tsc --noEmit -p tsconfig.check.json` — fix all type errors
- [ ] T024 Run `bun test` — all tests must pass

---

## Task Summary

| Phase | Tasks | Parallelizable |
|-------|-------|---------------|
| 1: Dependencies + Config | T001–T006 | T001–T005 sequential; T006 after T005 |
| 2: Search module | T007–T012 | T009, T012 parallel after T007 |
| 3: web_search tool (P1) | T013–T016 | T014 parallel with T013 |
| 4: web_fetch tool (P2) | T017–T019 | T018 parallel with T017 |
| 5: Configurability (P3) | T020–T021 | Both parallel |
| 6: Quality gates | T022–T024 | Sequential |

**Critical path**: T001 → T002–T005 → T007 → T008 → T010 → T013 → T015 → T016 → T017 → T019 → T022–T024
