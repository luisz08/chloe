# Review Brief: ink TUI for chloe chat

**Spec:** specs/006-ink-tui-chat/spec.md
**Generated:** 2026-04-15

> Reviewer's guide to scope and key decisions. See full spec for details.

---

## Feature Overview

This feature replaces the existing `chloe chat` readline interface with a full-screen terminal UI. The new UI renders role-differentiated message bubbles (You / Chloe / Tool), streams assistant replies token-by-token with a live cursor `▍`, renders Markdown in assistant responses, and displays a persistent bottom status bar with session name, model, token usage, context limit, usage percentage, and current state. No changes are made to `@chloe/core`; the UI is a pure presentation layer consuming existing callbacks.

## Scope Boundaries

- **In scope:** Full replacement of `chloe chat` UI; message view, input area, status bar, tool confirmation blocks, Markdown rendering, double-Ctrl+C exit
- **Out of scope:** Modifications to `@chloe/core`; mouse support; message search/filter; multi-session views; UI changes to other subcommands (`serve`, `sessions`, `config`); syntax highlighting in code blocks
- **Why these boundaries:** Keeps the change focused on the presentation layer. Core logic is untouched, which limits risk. Other subcommands are lower priority and can be upgraded separately.

## Critical Decisions

### Decision: Replace `chloe chat` entirely (not a new command)
- **Choice:** ink UI replaces the existing readline-based `chloe chat`; no fallback mode
- **Trade-off:** Simpler interface surface vs. users who prefer plain readline (e.g., CI/non-interactive environments)
- **Feedback:** Is it acceptable to remove the plain readline path entirely, or should a `--no-tui` flag be added as an escape hatch?

### Decision: Double Ctrl+C to exit
- **Choice:** First Ctrl+C shows warning, second exits — to prevent accidental termination
- **Trade-off:** Slightly less snappy exit vs. protection from fat-finger exits mid-thought
- **Feedback:** Is this the right UX for a developer tool where power users often Ctrl+C intentionally?

### Decision: Token count sourced from API `usage` field; context limit from model name
- **Choice:** Accumulate token counts from API response `usage`; look up context limit from a static model-name-to-limit map at startup
- **Trade-off:** Zero extra API calls vs. potential staleness if model limits change or a custom model is used
- **Feedback:** Acceptable to hardcode context limits per model name, or should there be a config override?

## Areas of Potential Disagreement

### Markdown rendering during streaming
- **Decision:** Best-effort rendering while streaming; incomplete elements fall back to plain text
- **Why this might be controversial:** "Best-effort" means the display will visually shift as more tokens arrive and partial Markdown resolves — some users may find this distracting
- **Alternative view:** Buffer the full reply and render only on completion (simpler, no visual jitter)
- **Seeking input on:** Is live-streaming Markdown rendering worth the potential visual jitter, or is a buffered approach preferable?

### No `--no-tui` fallback
- **Decision:** ink UI is the only mode; no plain readline escape hatch
- **Why this might be controversial:** Breaks non-interactive or narrow-terminal usage (CI, scripts piping to `chloe chat`)
- **Alternative view:** Keep readline as the default with `--tui` opt-in
- **Seeking input on:** Are there known usage patterns (CI, scripts, SSH sessions) where the ink UI would be problematic?

## Naming Decisions

| Item | Name | Context |
|------|------|---------|
| CLI component directory | `packages/cli/src/ui/` | All new ink components live here |
| State label: waiting for response | `thinking` | Status bar shows this between send and first token |
| State label: tokens arriving | `streaming` | Status bar shows this during active token delivery |
| State label: no active request | `idle` | Status bar shows this when input is active |

## Open Questions

- [ ] Should a `--no-tui` flag exist for non-interactive / narrow-terminal environments?
- [ ] Is a hardcoded model-name → context-limit map acceptable, or is a config override needed?
- [ ] Which Markdown rendering library is best compatible with ink + Bun? (deferred to implementation)

## Risk Areas

| Risk | Impact | Mitigation |
|------|--------|------------|
| ink compatibility with Bun | High | Verify ink + Bun compatibility early in implementation; choose alternative TUI lib if needed |
| Markdown rendering visual jitter during streaming | Med | Consider buffered render mode as configurable fallback |
| Double Ctrl+C UX friction | Low | Monitor user feedback; easy to change behaviour post-ship |

---
*Share with reviewers before implementation.*
