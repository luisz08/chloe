# Research: ink TUI Chat Interface

**Feature**: 006-ink-tui-chat
**Date**: 2026-04-15

---

## Decision 1: ink version

**Decision**: Use `ink` v6.x (specifically ≥ 6.7.0 for Kitty keyboard protocol support)

**Rationale**: ink v7.0.0 (released April 8, 2026) explicitly requires Node.js 22 and React 19.2+. While Bun has ~98% Node.js API compatibility, ink v7 is too new to validate against Bun. ink v6.7.0 introduced Kitty keyboard protocol support (opt-in, enabling Shift+Enter distinction) and is stable on Bun.

**Bun/readline conflict**: The critical issue is that Bun has a known bug ([#21189](https://github.com/oven-sh/bun/issues/21189)) where `readline.close()` destroys stdin when ink's `useInput` is active. The current `chat.ts` uses `readline.Interface` — it **must be completely replaced** by ink, not run alongside it.

**Alternatives considered**:
- ink v7: Too new, Node 22 requirement, risk not justified
- `@hexie/tui` (Bun-native): Only 4 commits, not production-ready
- Raw ANSI codes: High implementation cost, poor maintainability

---

## Decision 2: Text input component

**Decision**: Implement multi-line input manually using ink's `useInput` hook

**Rationale**: No production-ready multi-line input component exists in the ink ecosystem. `ink-text-input` v6.0.0 is single-line only, and a feature request for multi-line support (issue #676) has no response. `@inkjs/ui` is also single-line only. Additionally, `ink-text-input` has a known Bun bug (process exits immediately, #13569).

**Shift+Enter implementation**:
- Enable Kitty keyboard protocol in ink (opt-in, v6.7+) for terminals that support it (Kitty, WezTerm, Alacritty, Ghostty, iTerm2, Rio, Warp)
- Provide `Ctrl+J` as universal fallback for "insert newline" (sends `\n`, always distinct from Enter `\r`)
- Document in help text that Shift+Enter requires a modern terminal

**Alternatives considered**:
- `ink-text-input`: Single-line only + Bun process-exit bug
- Spawn `$EDITOR`: Too disruptive to UX; breaks the streaming experience
- `blessed`/`neo-blessed`: Conflicts with ink's renderer

---

## Decision 3: Markdown rendering

**Decision**: Use `Bun.markdown.ansi()` (built into Bun ≥ 1.3.12)

**Rationale**: Zero npm dependencies, CommonMark + GFM compliant, syntax-highlighted code blocks, written in Zig (near-zero overhead). Returns a plain ANSI string that can be dropped into an ink `<Text>` component. Since the project already runs on Bun ≥ 1.1, and Bun 1.3.12 is current (released April 4, 2026), this is the optimal choice.

**Streaming approach**: Accumulate tokens in a `useRef` string buffer. Apply a debounce of ~16ms (one frame) before calling `setState` to trigger a re-render. On each render, call `Bun.markdown.ansi(accumulatedText)` to produce the ANSI string. This is O(n) per render but acceptable for typical LLM outputs (< 5,000 tokens). If performance issues arise, implement block-level incremental parsing (only re-parse from the last unclosed block boundary).

**Alternatives considered**:
- `ink-markdown` / `@inkkit/ink-markdown`: Unmaintained (~2 years old), not tested against ink v6+
- `marked` + `marked-terminal`: Works (ANSI output passes through ink `<Text>`), but adds npm deps with no advantage over Bun's native API
- `@assistant-ui/react-ink-markdown`: Feature-rich but heavyweight dependency for a feature we can get for free from Bun

---

## Decision 4: Scrollable message list

**Decision**: Use `ink-scroll-view` (ByteLandTechnology, last updated January 2026)

**Rationale**: ink has no native scrollable region. `ink-scroll-view` is actively maintained, measures child heights via virtual DOM, and provides a `ControlledScrollView` for full state control. It works by rendering all children and shifting content vertically via `marginTop` inside an `<Box overflow="hidden">` viewport.

**Auto-scroll behaviour**: Track whether the user has manually scrolled up. If at the bottom, auto-scroll to latest message on each new message/token. If the user has scrolled up, pause auto-scroll. Resume when user scrolls back to bottom.

**Alternatives considered**:
- Manual virtual scrolling (array slicing + state): Viable but `ink-scroll-view` handles height measurement automatically
- `ink-console`: Suited for log output, not navigable chat history

---

## Decision 5: Token usage data

**Decision**: Add `onUsage` callback to `AgentCallbacks` in `@chloe/core/agent/types.ts`

**Rationale**: The only way to capture per-turn token usage is inside `runLoop` immediately after `stream.finalMessage()` is awaited. This requires adding one optional callback field to the existing `AgentCallbacks` interface and one call site in `loop.ts`. This is a **strictly additive, non-breaking change** — no existing behaviour is modified.

> **Spec update required**: FR-021 states "No code in `@chloe/core` MUST be modified." This must be relaxed to: "No existing business logic in `@chloe/core` MUST be modified. A single additive `onUsage` callback may be added to `AgentCallbacks`."

**Token fields exposed** (`stream.finalMessage().usage`):
- `input_tokens` — uncached input tokens
- `output_tokens` — cumulative output tokens for the turn
- `cache_read_input_tokens` — tokens served from cache (nullable)
- `cache_creation_input_tokens` — tokens written to cache (nullable)

**Usage display in status bar**: Sum `input_tokens + output_tokens + cache_read_input_tokens + cache_creation_input_tokens` across all turns in the session.

**Alternatives considered**:
- Wrapping the Agent at the CLI layer to intercept usage: Not possible — usage data is inside the streaming SDK call in `loop.ts`
- Using `message_start` SSE event: Only available as a raw stream event; the current `AgentCallbacks` API doesn't expose raw events

---

## Decision 6: Model context window limits

**Decision**: Static lookup table keyed by model name prefix, defaulting to 200,000 tokens

**Rationale**: All current Claude models have a 200K context window by default. The 1M window for Opus 4.6 and Sonnet 4.6 requires the beta header `context-1m-2025-08-07` — since the project doesn't currently set this header, 200K is the correct default for all models.

**Static map**:
```
claude-opus-4-6   → 200,000
claude-sonnet-4-6 → 200,000
claude-haiku-4-5  → 200,000
(default fallback) → 200,000
```

If an unknown model is configured, fall back to 200,000 tokens and display `?k` in the status bar.

---

## Spec Updates Required

1. **FR-021 relaxation**: Allow adding `onUsage` to `AgentCallbacks` in `@chloe/core` as a purely additive change
2. **Shift+Enter clarification**: Document `Ctrl+J` as the universal fallback for terminals without Kitty protocol support; Shift+Enter is best-effort
3. **ink version pin**: Target ink v6.x (≥ 6.7.0) explicitly, not v7+, to ensure Bun compatibility
