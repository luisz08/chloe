# Manual Test Cases: WebSearch + WebFetch Tools (015)

**Branch**: `015-web-search-fetch`  
**Date**: 2026-04-25  
**Tester**: _______________  
**Environment**: `bun run packages/cli/src/index.ts chat` (or `chloe chat`)

---

## Prerequisites

Before running these tests, ensure:

1. A valid API key is configured: `chloe config init` or `CHLOE_API_KEY=<key>`
2. Internet connection is available
3. The branch `015-web-search-fetch` is checked out
4. Python ≥3.8 is available: `python3 --version` (required for `web_search`; `ddgs` will auto-install on first use)
5. (Optional) For SC-001/002/003 timing, have a stopwatch ready

---

## TC-001: web_search — Basic Search (SC-001 Performance Gate)

**Goal**: Verify `web_search` returns results within 3 seconds on a normal connection.

**Steps**:
1. Start a chat session
2. Type: `请用 web_search 搜索 "bun 1.2 release notes"`
3. Start timing when the agent invokes the tool
4. Stop timing when results appear

**Expected Result**:
- [ ] Returns an array of results (at least 1, up to 5 by default)
- [ ] Each result has `title`, `url`, `snippet` fields
- [ ] Results are relevant to "bun 1.2 release notes"
- [ ] **Time ≤ 3 seconds** (SC-001)

**Actual Result**: _______________  
**Time taken**: _______________ s  
**Pass / Fail**: _______________

---

## TC-002: web_search — max_results Parameter

**Goal**: Verify `max_results` controls the number of returned results.

**Steps**:
1. Start a chat session
2. Type: `用 web_search 搜索 "TypeScript tutorial"，返回 3 条结果`
3. Observe the tool call and results

**Expected Result**:
- [ ] Agent calls `web_search` with `max_results: 3`
- [ ] Exactly 3 results returned (or fewer if DuckDuckGo has less)
- [ ] Each result has `title`, `url`, `snippet`

**Actual Result**: _______________  
**Pass / Fail**: _______________

---

## TC-003: web_fetch — Raw Markdown (SC-002 Performance Gate)

**Goal**: Verify `web_fetch` with `process: false` returns raw Markdown within 5 seconds.

**Steps**:
1. Start a chat session
2. Type: `用 web_fetch 获取 https://example.com 的内容，不需要模型处理（process: false）`
3. Start timing when the agent invokes the tool
4. Stop timing when Markdown content appears

**Expected Result**:
- [ ] Returns raw Markdown content (not a summary)
- [ ] Content contains headings, paragraphs in Markdown format (`#`, `**`, etc.)
- [ ] No `<script>`, `<style>`, `<nav>`, `<footer>` content included
- [ ] **Time ≤ 5 seconds** (SC-002)

**Actual Result**: _______________  
**Time taken**: _______________ s  
**Pass / Fail**: _______________

---

## TC-004: web_fetch — Model Processing Default (SC-003 Performance Gate)

**Goal**: Verify `web_fetch` with `process: true` (default) returns a model-processed summary within 15 seconds.

**Steps**:
1. Start a chat session
2. Type: `用 web_fetch 获取 https://bun.sh 的内容并总结`
3. Start timing when the agent invokes the tool
4. Stop timing when the summary appears

**Expected Result**:
- [ ] Returns a coherent summary of the Bun homepage
- [ ] Content is clearly a summary (not raw Markdown dump)
- [ ] Summary is in natural language
- [ ] **Time ≤ 15 seconds** (SC-003)

**Actual Result**: _______________  
**Time taken**: _______________ s  
**Pass / Fail**: _______________

---

## TC-005: web_fetch — Custom Prompt

**Goal**: Verify a custom `prompt` directs the model's extraction focus.

**Steps**:
1. Start a chat session
2. Type: `用 web_fetch 获取 https://bun.sh，并用这个 prompt 处理："列出所有提到的主要功能特性"`

**Expected Result**:
- [ ] Agent calls `web_fetch` with a custom `prompt` parameter
- [ ] Response focuses on features/functionality, not a generic summary
- [ ] Response is clearly different from TC-004's generic summary

**Actual Result**: _______________  
**Pass / Fail**: _______________

---

## TC-006: web_search → web_fetch Chained Workflow (User Story 1)

**Goal**: Verify the agent can search, then fetch a result for a complete research workflow.

**Steps**:
1. Start a chat session
2. Type: `请搜索 "Anthropic Claude API pricing 2025"，然后获取最相关的页面并总结定价信息`

**Expected Result**:
- [ ] Agent calls `web_search` first, gets a list of URLs
- [ ] Agent calls `web_fetch` on one or more results
- [ ] Final answer includes sourced pricing information
- [ ] Sources/URLs are cited in the response

**Actual Result**: _______________  
**Pass / Fail**: _______________

---

## TC-007: web_fetch — Non-HTML URL Error Handling

**Goal**: Verify `web_fetch` returns a clear error for non-HTML content.

**Steps**:
1. Start a chat session
2. Type: `用 web_fetch 获取 https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf`

**Expected Result**:
- [ ] Returns an error message mentioning the unsupported content type
- [ ] Does NOT crash or hang
- [ ] Error message is human-readable

**Actual Result**: _______________  
**Pass / Fail**: _______________

---

## TC-008: web_fetch — Non-200 HTTP Status Error Handling

**Goal**: Verify `web_fetch` returns an error for non-200 responses.

**Steps**:
1. Start a chat session
2. Type: `用 web_fetch 获取 https://httpstat.us/404`

**Expected Result**:
- [ ] Returns an error message mentioning HTTP 404
- [ ] Does NOT return the page content as Markdown
- [ ] Error message is human-readable

**Actual Result**: _______________  
**Pass / Fail**: _______________

---

## TC-009: web_search — DuckDuckGo Default (No [search] Config)

**Goal**: Verify DuckDuckGo is used as the default when no `[search]` section is in config.

**Steps**:
1. Ensure `~/.chloe/settings/config.toml` has **no** `[search]` section
2. Start a chat session
3. Type: `搜索 "hello world"`

**Expected Result**:
- [ ] `web_search` executes without error
- [ ] Results are returned (from DuckDuckGo)
- [ ] No error about missing provider configuration

**Config check**: `grep -A3 "\[search\]" ~/.chloe/settings/config.toml` → should return nothing

**Actual Result**: _______________  
**Pass / Fail**: _______________

---

## TC-010: Large Page Truncation

**Goal**: Verify very large pages are truncated to 50,000 characters before model processing.

**Steps**:
1. Start a chat session
2. Type: `用 web_fetch 获取 https://en.wikipedia.org/wiki/Python_(programming_language)，process: false`
3. Count or estimate the character length of the returned content

**Expected Result**:
- [ ] Returns Markdown content
- [ ] Content length is ≤ 50,000 characters (if page is large)
- [ ] Content is not cut mid-word in a confusing way (truncation at char boundary)

**Actual Result**: _______________  
**Approximate length**: _______________ chars  
**Pass / Fail**: _______________

---

## Summary

| Test | Description | Result | Time |
|------|-------------|--------|------|
| TC-001 | web_search basic + SC-001 timing | | s |
| TC-002 | max_results parameter | | — |
| TC-003 | web_fetch raw Markdown + SC-002 timing | | s |
| TC-004 | web_fetch model processing + SC-003 timing | | s |
| TC-005 | web_fetch custom prompt | | — |
| TC-006 | Search → Fetch chained workflow | | — |
| TC-007 | Non-HTML error handling | | — |
| TC-008 | Non-200 HTTP error handling | | — |
| TC-009 | DuckDuckGo default (no config) | | — |
| TC-010 | Large page truncation | | — |

**SC-001 (web_search < 3s)**: Pass / Fail — Measured: ___ s  
**SC-002 (web_fetch no-model < 5s)**: Pass / Fail — Measured: ___ s  
**SC-003 (web_fetch with-model < 15s)**: Pass / Fail — Measured: ___ s  

**Overall**: Pass / Fail

**Notes / Issues found**:

---
