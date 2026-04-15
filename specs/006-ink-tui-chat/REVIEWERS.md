# Review Guide: ink TUI Chat Interface

**Spec:** [spec.md](spec.md) | **Plan:** [plan.md](plan.md) | **Tasks:** [tasks.md](tasks.md)
**Generated:** 2026-04-15

---

## What This Spec Does

This spec replaces the `chloe chat` readline interface with a full-screen terminal UI built using `ink` (React for terminals). The new UI gives users a structured conversation view with streaming replies, a persistent status bar showing token consumption, and inline tool confirmation — similar in feel to Claude Code or OpenCode. No `@chloe/core` business logic changes; only one additive callback (`onUsage`) is added to surface token usage data to the UI layer.

**In scope:** Full replacement of `chloe chat` UI; streaming message view; status bar; multi-line input; inline tool confirmation; Markdown rendering

**Out of scope:** Other subcommands (`serve`, `sessions`, `config`); mouse support; message search; multi-session views; `--no-tui` fallback mode (explicitly excluded)

## Bigger Picture

This is the first significant UI investment in the project. The earlier specs (001–005) established the core agent loop, config system, logging, and tools. This spec is the first time a user-facing presentation layer is being built on top of that foundation. What follows this will likely be shaped by how well the `AgentCallbacks` interface holds up as a UI data bus — if the callbacks feel insufficient, future features (e.g., cost tracking, multi-turn summaries) will require further core changes. The decision to use `Bun.markdown.ansi()` instead of an npm Markdown library is a Bun-specific bet that binds the CLI tightly to the Bun runtime — reasonable for this project but worth noting.

Relevant ecosystem context: ink v7 was released April 8, 2026 (Node 22 required), and the plan deliberately pins to v6.x for Bun compatibility. Bun has known edge cases with ink's `setRawMode` and `readline` coexistence; the plan's decision to fully remove readline from `chat.ts` is the correct mitigation.

---

## Spec Review Guide (30 minutes)

> This guide helps you focus your 30 minutes on the parts of the spec and plan that need human judgment most.

### Understanding the approach (8 min)

Read the [Functional Requirements](spec.md#functional-requirements) and the [Implementation Phases](plan.md#implementation-phases) in plan.md. As you read, consider:

- Does [FR-020](spec.md#functional-requirements) ("UI is a pure presentation layer consuming `@chloe/core` via callbacks and props only") hold up given that the plan also adds an `onUsage` callback to core? Is this additive change truly non-breaking, or does it create a precedent for UI-driven core changes?
- The plan calls for a complete readline removal from `chat.ts` ([Phase D](plan.md#phase-d--chatts-rewrite-and-cleanup)). Are there other files in the CLI that use readline (`sessions.ts`, `config.ts`) that might still mix readline with ink's runtime if they're ever loaded in the same process?
- [FR-019](spec.md#functional-requirements) requires the command signature to be unchanged. Is `chloe chat` the only entry point, or do any scripts or docs reference the old readline-based interaction patterns that would break?

### Key decisions that need your eyes (12 min)

**Bun.markdown.ansi() as the Markdown renderer** ([research.md — Decision 3](research.md))

The plan uses a Bun built-in API that was added in Bun v1.3.12 (April 4, 2026) with no npm dependency. The spec requires Bun ≥ 1.3.12 as a result.
- Does this minimum Bun version requirement need to be surfaced somewhere (README, error message at startup)? Currently it only appears in quickstart.md.
- If a user runs on Bun 1.3.11 or earlier, `Bun.markdown.ansi` will be undefined. Is there a fallback (plain text) or a startup guard?

**No multi-line input library; manual useInput implementation** ([research.md — Decision 2](research.md))

The entire multi-line input (auto-expand, Ctrl+J newline, Shift+Enter with Kitty protocol) is hand-rolled using ink's `useInput` hook. No library handles this.
- Is the complexity of a custom multi-line input worth it compared to shipping with single-line input (Enter to send, no Shift+Enter) and iterating later?
- The spec says Shift+Enter is the primary UX ([FR-009](spec.md#functional-requirements)) but the research shows this requires the Kitty keyboard protocol, which is not universal. Is `Ctrl+J` as the documented fallback acceptable to your users, or should the spec be clearer that Shift+Enter is a bonus, not a guarantee?

**onUsage callback added to @chloe/core** ([contracts/agent-callbacks.md](contracts/agent-callbacks.md))

[FR-021](spec.md#functional-requirements) says "No code in `@chloe/core` MUST be modified" but the plan adds `onUsage` to `AgentCallbacks` in `types.ts` and `loop.ts`. This is framed as an additive exception.
- Is the `onUsage` callback the right abstraction? The data it provides (per-turn usage) is richer than what the UI currently needs (session totals). Should a higher-level `onTurnComplete` callback be considered instead, which bundles usage with other turn-level signals?
- Are there other callers of `createAgent()` (e.g., the API package) that should also start consuming `onUsage` for logging or billing purposes? If so, this change is load-bearing across packages, not just UI-local.

**ink v6.x pin, not v7** ([research.md — Decision 1](research.md))

The plan pins ink to v6.x because v7 requires Node 22 and is brand-new. This is cautious but may require revisiting.
- ink v7 introduced `alternateScreen` and `useWindowSize` hooks that would simplify the full-screen layout. Is there a timeline to upgrade once Bun/ink v7 compatibility is confirmed?

### Areas where I'm less certain (5 min)

- [spec.md — Success Criteria SC-005](spec.md#measurable-outcomes): "All user interactions respond within 100ms." This is stated as a success criterion but the plan has no automated measurement for it. I validated it can be checked manually, but that's subjective. If this matters, a benchmark or integration test should be specified.

- [plan.md — Phase C, ChatView.tsx](plan.md#phase-c--individual-ui-components): The auto-scroll logic ("pause on manual scroll-up, resume on scroll-to-bottom") is described but not fully specified. What defines "manual scroll-up"? Is any upward scroll key considered manual? What input returns the user to auto-scroll? This is underspecified and could surprise implementers.

- [spec.md — Edge Cases](spec.md#edge-cases): "API failure during streaming: an [Error] block appears." The spec doesn't define what the error block looks like or whether partial streaming content is preserved or discarded. The implementer will have to decide.

### Risks and open questions (5 min)

- [research.md — Decision 1](research.md): Bun has a known bug where `readline.close()` breaks ink's `useInput`. If any transitively loaded module calls `readline.close()` (e.g., a logging library or a future core change), the input layer will silently die. Is there a way to guard against this at the architecture level, or is "don't use readline anywhere in the process" sufficient as a documented constraint?

- [plan.md — Phase B](plan.md#phase-b--ui-types-and-root-structure): `App.tsx` is described as holding all state, wiring AgentCallbacks, managing the `runLoop` call, and handling exit logic. This is a lot for one component. Does this violate the spirit of [Principle IV (DRY)](https://github.com) in the constitution — should some of this be factored into a custom hook from the start?

- [tasks.md — T010](tasks.md): Deleting `stream.ts` and `confirm.ts`. Are these files imported anywhere other than `chat.ts`? If the API package or a test imports from them, deletion will break the build. The task should include an explicit grep check before deleting.

---
*Full context in linked [spec](spec.md) and [plan](plan.md).*
