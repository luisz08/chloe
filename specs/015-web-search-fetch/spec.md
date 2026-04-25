# Feature Specification: WebSearch + WebFetch Tools

**Feature Branch**: `015-web-search-fetch`
**Created**: 2026-04-24
**Status**: Draft

## User Scenarios & Testing

### User Story 1 - Agent searches the web and reads results (Priority: P1)

The agent receives a user question that requires current information. It calls `web_search` to find relevant URLs, then calls `web_fetch` on promising results to get the full content, and synthesizes an answer.

**Why this priority**: Core use case — without search + fetch, the agent is limited to its training data.

**Independent Test**: Can be tested by giving the agent a question about a recent event and verifying it returns a sourced answer.

**Acceptance Scenarios**:

1. **Given** a `web_search` call with `query: "bun 1.2 release notes"`, **When** the tool executes, **Then** it returns a list of up to `max_results` objects each with `title`, `url`, and `snippet` fields.
2. **Given** a `web_fetch` call with a URL from search results, **When** the tool executes with `process: true`, **Then** it returns a clean Markdown summary of the page content.
3. **Given** a `web_fetch` call with `process: false`, **When** the tool executes, **Then** it returns the raw Markdown-converted page content without model processing.

---

### User Story 2 - Agent fetches a specific URL with a targeted prompt (Priority: P2)

The user asks the agent to extract specific information from a URL (e.g. "what are the pricing tiers on this page?"). The agent calls `web_fetch` with a custom `prompt` to direct the model's extraction.

**Why this priority**: High-value use case; the `prompt` parameter unlocks precision extraction vs. generic summarization.

**Independent Test**: Call `web_fetch` with a URL and `prompt: "list all pricing tiers"` and verify the response is focused on pricing rather than a generic summary.

**Acceptance Scenarios**:

1. **Given** `web_fetch` with `url`, `process: true`, and `prompt: "extract all code examples"`, **When** the tool runs, **Then** the fast model uses the provided prompt to process the content and the response reflects that focus.
2. **Given** `web_fetch` with `process: true` and no `prompt`, **When** the tool runs, **Then** the fast model defaults to summarizing the page.

---

### User Story 3 - Search provider is configurable (Priority: P3)

A power user switches from DuckDuckGo to Brave Search by adding their API key to config. The same `web_search` tool works transparently without any code changes.

**Why this priority**: Enables future extensibility without requiring implementation now.

**Independent Test**: Can be deferred — P3 only requires the provider interface and factory to be in place; Brave implementation is a future placeholder.

**Acceptance Scenarios**:

1. **Given** no `[search]` config, **When** `web_search` is called, **Then** it uses DuckDuckGo by default.
2. **Given** `[search] provider = "brave"` and a `brave_api_key` in config, **When** `web_search` is called, **Then** it routes to the Brave provider.

---

### Edge Cases

- What happens when the URL returns a non-200 status? → `web_fetch` returns an error message describing the HTTP status.
- What happens when the HTML is malformed? → `turndown` handles best-effort conversion; partial content is returned.
- What happens when DuckDuckGo returns no results? → `web_search` returns an empty array.
- What happens when `web_fetch` is called on a non-HTML URL (PDF, image)? → Return an error indicating unsupported content type.
- What happens when the fetched page content exceeds the model's context? → Truncate to a safe limit before passing to the fast model.

## Requirements

### Functional Requirements

- **FR-001**: A `web_search` agent tool MUST accept `query: string` and optional `max_results: number` (default 5, max 20).
- **FR-002**: `web_search` MUST return an array of `{ title: string, url: string, snippet: string }` objects.
- **FR-003**: `web_search` MUST use DuckDuckGo as the default provider via Python's `ddgs` library invoked as a Bun subprocess (`Bun.spawn`).
- **FR-004**: A `web_fetch` agent tool MUST accept `url: string`, optional `process: boolean` (default `true`), and optional `prompt: string`.
- **FR-005**: `web_fetch` MUST convert HTML to Markdown using `node-html-parser` + `turndown` before any further processing.
- **FR-006**: When `process: true`, `web_fetch` MUST pass the Markdown content to the configured fast model along with the `prompt` (defaulting to `"Summarize the key information from this web page content concisely."`).
- **FR-007**: When `process: false`, `web_fetch` MUST return the raw Markdown content without model processing.
- **FR-008**: A `SearchProvider` interface MUST be defined so new providers (Brave, Tavily) can be added without changing tool code.
- **FR-009**: A `getSearchProvider(config)` factory MUST select the provider based on `config.search.provider` (default `"duckduckgo"`).
- **FR-010**: The TOML config MUST support a `[search]` section with at minimum a `provider` field and an optional `brave_api_key` field for the Brave provider. The `ChloeConfig` interface in `core/src/config.ts` MUST be extended with a `search: SearchConfig` field.
- **FR-011**: Before passing content to the fast model, `web_fetch` MUST truncate Markdown to a maximum of 50,000 characters to stay within model context limits.
- **FR-012**: Before executing a DuckDuckGo search, `DuckDuckGoProvider` MUST detect a Python ≥3.8 executable (`python3` or `python`). If none is found or the version is too old, `web_search` MUST return an error message instructing the user to install Python.
- **FR-013**: `DuckDuckGoProvider` MUST check if the `ddgs` package is importable before running a search. If not, it MUST automatically install `ddgs` via `[pythonPath, "-m", "pip", "install", "ddgs"]`, log installation details to the logger, and notify the caller via `options.notify` with a human-readable message.
- **FR-014**: `DuckDuckGoProvider` MUST call Python via `Bun.spawn([pythonPath, "-c", inlineScript])` where the inline script uses `DDGS().text()` and prints results as a JSON array to stdout. Each result MUST map `r["title"]`, `r["href"]`, `r.get("body","")` to `{ title, url, snippet }`.
- **FR-015**: Python detection and `ddgs` availability MUST be cached per `DuckDuckGoProvider` instance to avoid re-checking on every search call.
- **FR-016**: Brave Search remains a supported alternative provider (requires `brave_api_key`). The `SearchProvider` interface and `getSearchProvider` factory remain unchanged.

### Key Entities

- **SearchProvider**: Interface with `search(query, options) → Promise<SearchResult[]>`.
- **SearchResult**: `{ title: string, url: string, snippet: string }`.
- **SearchOptions**: `{ maxResults?: number; notify?: (message: string) => void }`.

## Success Criteria

### Measurable Outcomes

- **SC-001**: `web_search` returns results in under 3 seconds on a normal connection.
- **SC-002**: `web_fetch` with `process: false` returns Markdown content in under 5 seconds.
- **SC-003**: `web_fetch` with `process: true` returns a processed response in under 15 seconds.
- **SC-004**: All existing tests continue to pass after adding the new tools.
- **SC-005**: Python ≥3.8 and the `ddgs` package are required for DuckDuckGo search. Clear, actionable error messages guide users through setup. The `ddgs` package is auto-installed on first use.

## Assumptions

- The project's Bun runtime can install `node-html-parser` and `turndown` as npm dependencies.
- The fast model slot (`config.fastModel`) is already configured; `web_fetch` reuses it without introducing a new config key.
- Python ≥3.8 is available on the user's system (standard on macOS/Linux developer machines). The `ddgs` package is auto-installed on first use.
- Brave Search is a supported alternative for users who prefer an API-key based approach or do not have Python available.
- Tavily provider implementation remains out of scope; only the interface and factory need to be in place.
- `web_search` and `web_fetch` are registered as agent tools (in `packages/core/src/tools/`), not as CLI subcommands.
- The search module lives at `packages/core/src/search/` and is internal to core.
