# Reviewer Guide: Chloe — Personal AI Agent

**Branch**: `001-chloe-personal-ai-agent` | **Date**: 2026-04-13
**Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md) | **Tasks**: [tasks.md](tasks.md)

---

## What This Feature Is

Chloe is a personal AI agent powered by Anthropic Claude. It exposes a single `@chloe/core` library consumed by a CLI entry point (interactive REPL) and a REST/SSE API service. The agent uses a ReAct loop (think → tool call → observe → repeat), requires human confirmation before tool execution (by default), persists named sessions in SQLite, and has a plugin-ready tool registry. The initial tool is a reference EchoTool.

---

## Key Design Decisions to Validate

### 1. Core-Library-First Architecture
The entire agent loop, session management, storage, and tool registry live in `packages/core`. The CLI and API are thin entry points that import only from `@chloe/core`. **Check**: no business logic in `packages/cli/src/` or `packages/api/src/` beyond argument parsing, I/O formatting, and HTTP routing.

### 2. ReAct Loop Correctness (FR-005)
The loop streams text deltas, detects `stop_reason === 'tool_use'`, calls the tool (or records denial), injects `tool_result` observations, and repeats. **Check**: `packages/core/src/agent/loop.ts` implements this faithfully, including multi-turn cases and unknown tool graceful handling. Unit tests in `loop.test.ts` must cover all branches.

### 3. Human-in-the-Loop via Callback (FR-006)
`confirmTool?: (name, input) => Promise<boolean>` is passed as a callback, keeping the core loop decoupled from I/O. **Check**: loop.ts never imports readline or any CLI module. The CLI passes `confirm()` from `ui/confirm.ts`; the API passes an auto-confirm callback.

### 4. StorageAdapter Interface (FR-008)
The interface must be the only type the core agent depends on — no concrete SQLite imports in `agent.ts` or `loop.ts`. **Check**: constructor injection; `SQLiteStorageAdapter` implements the interface but is never hardcoded inside the core loop.

### 5. Streaming Always (FR-011, NFR enforcement)
`client.messages.stream()` is used exclusively. `client.messages.create()` must not appear anywhere. **Check**: grep for `messages.create` — should find zero results.

### 6. TypeScript Strictness (NFR-002)
`strict`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess` are all enabled. **Check**: `tsc --noEmit` exits 0; no `any` types, no `as` casts except at SDK boundaries, no `!` non-null assertions.

### 7. Biome Clean (NFR-003)
`bunx biome check --error-on-warnings .` exits 0. **Check**: no unused variables, no explicit any, consistent formatting.

---

## Risk Areas

| Area | Risk | What to Check |
|------|------|---------------|
| ReAct loop termination | Infinite loop if model never returns `end_turn` | Is there a max-iterations guard? (Not required by spec for v1 but consider it) |
| SSE stream cleanup | Client disconnect leaks the Anthropic stream | Does `ReadableStream.cancel()` abort the Anthropic stream? |
| SQLite directory creation | `~/.chloe/` may not exist | T011: constructor creates parent dir before `new Database()` |
| History serialization | Anthropic tool_use blocks must round-trip via JSON | `messages` column stores full `MessageParam` content array |
| `noUncheckedIndexedAccess` | Array/object index access requires null checks | Common source of TS errors; review all `arr[i]` and `obj[key]` access |

---

## Acceptance Checklist for Reviewers

- [ ] `bun install && bunx biome check . && bun test` all pass from repo root
- [ ] `chloe chat --session demo` streams a reply; re-running recalls prior history
- [ ] Tool confirmation prompt appears; confirming executes EchoTool; denying is graceful
- [ ] `chloe serve` starts; `curl -N -X POST .../sessions/s1/messages -d '{"content":"Hello"}'` returns SSE
- [ ] `chloe sessions list` shows sessions; `chloe sessions delete <id>` removes one
- [ ] No `messages.create` calls in codebase (streaming-only enforcement)
- [ ] No business logic in `packages/cli/src/` or `packages/api/src/`
- [ ] All loop.test.ts cases pass including multi-turn and tool-denied

---

## Files to Focus On

| File | Why Important |
|------|---------------|
| `packages/core/src/agent/loop.ts` | Core ReAct loop — highest complexity, highest risk |
| `packages/core/src/agent/loop.test.ts` | Must cover all loop branches |
| `packages/core/src/storage/adapter.ts` | Contract between core and storage backends |
| `packages/core/src/storage/sqlite.ts` | Only concrete storage implementation |
| `packages/api/src/handlers/messages.ts` | SSE streaming + stream lifecycle management |
| `packages/core/src/index.ts` | Public API surface — exports must be complete and intentional |
