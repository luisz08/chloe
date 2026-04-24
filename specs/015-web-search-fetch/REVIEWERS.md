# Review Guide: WebSearch + WebFetch Tools (015)

**Branch**: `015-web-search-fetch`
**Spec**: `specs/015-web-search-fetch/spec.md`
**Plan**: `specs/015-web-search-fetch/plan.md`

## Coverage Matrix

| Requirement | Tasks | Status |
|-------------|-------|--------|
| FR-001: web_search input schema (query, max_results) | T013 | ✅ |
| FR-002: web_search returns SearchResult[] | T013, T014 | ✅ |
| FR-003: DuckDuckGo pure TS implementation | T008 | ✅ |
| FR-004: web_fetch input schema (url, process, prompt) | T017 | ✅ |
| FR-005: HTML→Markdown via node-html-parser + turndown | T017 | ✅ |
| FR-006: process:true → fast model + prompt | T017, T018 | ✅ |
| FR-007: process:false → raw Markdown | T017, T018 | ✅ |
| FR-008: SearchProvider interface | T007 | ✅ |
| FR-009: getSearchProvider factory | T010, T012 | ✅ |
| FR-010: [search] TOML + ChloeConfig extension | T002–T005, T021 | ✅ |
| FR-011: 50,000 char truncation | T017, T018 | ✅ |
| SC-001/002/003: Performance targets (<3s/<5s/<15s) | Manual verification | ⚠️ No automated test |
| SC-004: Existing tests pass | T024 | ✅ |
| SC-005: No Python dependency | T001, T008 | ✅ |

**Note on SC-001/002/003**: Performance targets are not enforced by automated tests. Reviewer should manually verify response times against a live network during review.

## Areas Requiring Close Review

### 1. DuckDuckGo HTML parsing (T008) — Fragility risk

The DuckDuckGo HTML endpoint is unofficial. The CSS selectors (`.result`, `.result__a`, `.result__snippet`) may change without notice. Reviewer should:
- Verify selectors against live DDG HTML at review time
- Confirm DDG redirect URL decoding (`/l/?uddg=`) handles both encoded and bare URLs
- Confirm `User-Agent` header is present (DDG returns 403 without it)

### 2. `web_fetch` default behavior (T017) — `process` defaults to `true`

The spec's default is `process: true` (model processing on by default). Reviewer must verify:
- Omitting `process` triggers model call, not raw return
- `process: false` explicitly skips model call
- TypeScript schema uses `process?: boolean` (optional, not required)

### 3. Content truncation (FR-011, T017)

50,000 char limit must be applied **before** the model call, not after. Reviewer should verify:
- Truncation happens on Markdown, not on raw HTML
- A page that truncates still returns meaningful (not mid-word cut) content

### 4. Config extension (T002–T005) — strict TypeScript compliance

`exactOptionalPropertyTypes: true` is active. `braveApiKey?: string` in `SearchConfig` means it may not be present at all — passing `braveApiKey: undefined` would be a type error. Reviewer should verify the config load code handles absence correctly.

### 5. Tool wiring (T015, T016, T019)

- `web_fetch` is registered unconditionally (no config needed)
- `web_search` is registered **only when** `searchConfig` is provided
- Reviewer must verify `createDefaultTools()` signature change is backward-compatible (optional param, no callers broken)

## Test Coverage Checklist

- [ ] `DuckDuckGoProvider` tested with fixture HTML (mock fetch)
- [ ] URL decoding from DDG redirect format tested
- [ ] `web_search` tested with mocked provider (not live network)
- [ ] `web_fetch` tested with mocked fetch (not live network)
- [ ] `process: true` (default) path tested
- [ ] `process: false` path tested
- [ ] Custom `prompt` tested
- [ ] Truncation at 50,000 chars tested
- [ ] Non-HTML content-type error tested
- [ ] `context` undefined fallback tested
- [ ] Config with `[search]` section tested
- [ ] Config without `[search]` section → default `"duckduckgo"` tested
- [ ] `CHLOE_SEARCH_PROVIDER` env override tested

## Constitution Compliance

| Principle | Verdict |
|-----------|---------|
| Core-Library-First | ✅ All logic in `packages/core/src/` |
| Strict TypeScript | Verify — `turndown` types, `exactOptionalPropertyTypes` |
| Biome | Verify — run `bunx biome check --error-on-warnings .` |
| DRY | ✅ Single `SearchProvider` interface |
| Plugin Contracts | ✅ Interface-first design |
| Streaming Always | ✅ Tool sub-calls are non-streaming (correct per pattern) |
| Unit Tests | Verify — critical paths covered per checklist above |
| Human-in-the-Loop | ✅ Default confirmation flow unchanged |
