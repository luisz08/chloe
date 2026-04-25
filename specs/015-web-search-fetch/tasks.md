# Tasks: WebSearch + WebFetch Tools

**Branch**: `015-web-search-fetch`
**Input**: `specs/015-web-search-fetch/` (spec.md, plan.md, research.md, data-model.md)
**Status**: ✅ All tasks complete

---

## Phase 1: Dependencies + Config (Shared Infrastructure)

**Purpose**: Install npm packages and extend config — blocks all tool implementation.

- [x] T001 Add `node-html-parser`, `turndown`, `@types/turndown` to `packages/core/package.json` via `bun add`
- [x] T002 Add `SearchConfig` interface to `packages/core/src/config.ts` (`{ provider: string; braveApiKey?: string }`)
- [x] T003 Add `search: SearchConfig` field to `ChloeConfig` interface in `packages/core/src/config.ts`
- [x] T004 Add `searchProvider: "duckduckgo"` to `DEFAULTS` in `packages/core/src/config.ts`
- [x] T005 Extend `loadConfigFrom` in `packages/core/src/config.ts`: extract `fileSearch = section(raw, "search")`, derive `searchProvider` (env `CHLOE_SEARCH_PROVIDER` → TOML → default), return `search: { provider: searchProvider }`
- [x] T006 Add config unit tests in `packages/core/src/config.test.ts`: (a) `[search]` section present, (b) `[search]` absent → default `"duckduckgo"`, (c) `CHLOE_SEARCH_PROVIDER` env override

**Checkpoint**: ✅ Config extension complete.

---

## Phase 2: Search Module (Foundational for `web_search`)

**Purpose**: `SearchProvider` interface + DuckDuckGo implementation — required before `web_search` tool.

> **Note**: Original plan used direct HTML scraping of `https://html.duckduckgo.com/html/`. This was replaced with a Python `ddgs` subprocess approach after discovering DDG returns a 202 bot-challenge (CAPTCHA) for automated requests. See FR-012–FR-016 in spec.md.

- [x] T007 Create `packages/core/src/search/types.ts` with `SearchResult`, `SearchOptions` (incl. `notify?` callback), `SearchProvider` interface
- [x] T008 Create `packages/core/src/search/providers/duckduckgo.ts` — `DuckDuckGoProvider` implementing `SearchProvider`:
  - Detect Python ≥3.8 (`python3` or `python`); throw descriptive error if not found
  - Check `ddgs` importability; auto-install via `pip install ddgs` if missing; call `options.notify` with status message
  - Cache python path and install status per instance (FR-015)
  - Invoke `Bun.spawn([python, "-c", inlineScript])` where script calls `DDGS().text()` and prints JSON to stdout
  - Respect `maxResults` (default 5, clamp 1–20)
- [x] T009 Create `packages/core/src/search/providers/brave.ts` — `BraveProvider` implementing Brave Search REST API (`X-Subscription-Token` auth, GET `https://api.search.brave.com/res/v1/web/search`)
- [x] T010 Create `packages/core/src/search/index.ts` — `getSearchProvider(config: SearchConfig): SearchProvider` factory (switch on `config.provider`; throws if `brave` selected without `braveApiKey`)
- [x] T011 Unit tests for `DuckDuckGoProvider` (`duckduckgo.test.ts`): mock `Bun.spawn` via `spyOn`, test result parsing, Python not found, ddgs auto-install + notify, caching, subprocess error
- [x] T012 Unit tests for `BraveProvider` (`brave.test.ts`) and `getSearchProvider` (`index.test.ts`): provider routing, API key requirement, error handling

---

## Phase 3: User Story 1 — `web_search` tool (Priority: P1) 🎯 MVP

**Goal**: Agent can call `web_search` to get a list of URLs + snippets for a query.

- [x] T013 Create `packages/core/src/tools/web-search.ts` — `createWebSearchTool(searchConfig: SearchConfig): Tool`:
  - Input schema: `{ query: string, max_results?: number }`
  - Calls `getSearchProvider(searchConfig).search(query, { maxResults, notify })`
  - When `notify` fires (ddgs auto-install), prefixes output with `"Notice: …\n"`
  - Returns `JSON.stringify(results)` or `"Error: …"`
  - Validates: `query` non-empty, clamp `max_results` to 1–20
- [x] T014 Unit tests for `web-search.ts`: mock `Bun.spawn`, test normal response, install notice prefix, empty query error, max_results clamping, Python not available error
- [x] T015 Wire up in `packages/core/src/tools/index.ts` — add optional `searchConfig?: SearchConfig` param to `createDefaultTools()`; conditionally register `createWebSearchTool(searchConfig)` when provided
- [x] T016 Modify `packages/core/src/agent/agent.ts` — pass `config.search` to `createDefaultTools()`

**Checkpoint**: ✅ `web_search` available to agent.

---

## Phase 4: User Story 2 — `web_fetch` tool (Priority: P2)

**Goal**: Agent can fetch a URL and get Markdown content, optionally processed by fast model with custom prompt.

- [x] T017 Create `packages/core/src/tools/web-fetch.ts` — `createWebFetchTool(): Tool`:
  - Input schema: `{ url: string, process?: boolean, prompt?: string }`
  - Fetch URL with `fetch()`, check `response.ok` (non-200 → error), check `Content-Type` — reject non-HTML with descriptive error
  - Parse with `node-html-parser`, strip `<script>/<style>/<nav>/<footer>` nodes
  - Convert to Markdown with `turndown`; truncate to 50,000 chars (FR-011)
  - If `process: false` → return Markdown directly
  - If `process: true` (default) → call `context.client.messages.create({ model: fastModel, … })`
  - Default prompt: `"Summarize the key information from this web page content concisely."`
  - Fallback when `context` is undefined: return raw truncated Markdown
- [x] T018 Unit tests for `web-fetch.ts`: all scenarios from spec (process false/true, custom prompt, truncation, non-HTML, non-200, context undefined)
- [x] T019 Register `createWebFetchTool()` unconditionally in `createDefaultTools()` in `packages/core/src/tools/index.ts`

**Checkpoint**: ✅ `web_fetch` available to agent.

---

## Phase 5: User Story 3 — Provider configurability (Priority: P3)

- [x] T020 `getSearchProvider` factory routes correctly; end-to-end config wiring verified
- [x] T021 `brave_api_key` field extracted in `loadConfigFrom`; also supports `CHLOE_BRAVE_API_KEY` env var

---

## Phase 6: Quality Gates

- [x] T022 `bunx biome check --error-on-warnings .` — 0 errors
- [x] T023 `bunx tsc --noEmit -p tsconfig.check.json` — 0 errors
- [x] T024 `bun test` — 372/372 pass

---

## Pending: Manual Tests

Manual test cases documented in `manual-test-cases.md` (TC-001 through TC-010). TC-001 was previously failing due to DDG CAPTCHA; the `ddgs` subprocess approach resolves it. All manual tests should be re-run to confirm end-to-end behavior.

---

## Task Summary

| Phase | Tasks | Status |
|-------|-------|--------|
| 1: Dependencies + Config | T001–T006 | ✅ Done |
| 2: Search module | T007–T012 | ✅ Done (impl changed to ddgs subprocess) |
| 3: web_search tool (P1) | T013–T016 | ✅ Done |
| 4: web_fetch tool (P2) | T017–T019 | ✅ Done |
| 5: Configurability (P3) | T020–T021 | ✅ Done |
| 6: Quality gates | T022–T024 | ✅ Done |
| Manual testing | TC-001–TC-010 | ⏳ Pending |
