---
date: 2026-04-15
status: spec-created
spec: specs/006-ink-tui-chat/
---

# Brainstorm: ink TUI Chat Interface

**Date:** 2026-04-15
**Status:** spec-created
**Spec:** specs/006-ink-tui-chat/

## Problem Framing

The current `chloe chat` command uses Node.js `readline` — plain text, no structure, no visible state. Users have no visibility into token consumption or context usage, and the UX is far below the bar set by tools like Claude Code or OpenCode. The goal is to replace the readline interface with a full-screen terminal UI that looks and feels like a first-class AI coding assistant.

## Approaches Considered

### A: ink + Component-Layered Architecture (Chosen)
- Pros: React model is well understood; ink handles full-screen re-renders and resize events; component isolation aligns with the project's Core-Library-First constitution; status bar + fixed input layout is natural with flexbox
- Cons: Introduces ink + React peer dependency; Bun/ink compatibility requires early verification; debugging is more complex than readline

### B: ink + Single Flat Component
- Pros: Faster to write initially
- Cons: Grows unmaintainable quickly; violates single-responsibility principle; harder to test

### C: Raw ANSI Escape Codes (No Framework)
- Pros: Zero new dependencies
- Cons: High implementation cost; cross-platform edge cases; poor readability; doesn't justify avoiding ink

## Decision

Approach A: ink with a layered component architecture. All UI components live in `packages/cli/src/ui/` and are pure presentation — business logic remains entirely in `@chloe/core`.

## Key Design Choices Made

- **Replace, not add**: ink UI replaces `chloe chat` entirely; no `--no-tui` fallback (open question remains)
- **Double Ctrl+C exit**: First press shows warning, second exits — prevents accidental termination
- **Bottom status bar**: Always-visible single line showing session, model, tokens used, context limit, usage %, and state (idle / thinking / streaming)
- **Inline tool confirmation**: Tool blocks appear in the conversation flow; `y/N` confirmed within the block
- **Markdown rendering**: Best-effort during streaming, full parse on completion; incomplete elements fall back to plain text
- **Token tracking**: Accumulated from API `usage` field; context limit looked up from static model-name map

## Open Threads

- Should a `--no-tui` escape hatch exist for CI/script/narrow-terminal environments?
- Is a hardcoded model-name → context-limit map acceptable, or should a config override be supported?
- Which Markdown rendering library is best compatible with ink + Bun? (deferred to implementation)
- Is live-streaming Markdown rendering worth the visual jitter, or should buffered rendering be an option?
