# Tasks: Chloe — Personal AI Agent

**Input**: Design documents from `/specs/001-chloe-personal-ai-agent/`
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/api.md ✅

---

## Phase 1: Scaffolding (Shared Infrastructure)

**Purpose**: Bun workspace skeleton with all packages wired, TypeScript and Biome configured, passing `bun install && biome check . && bun test`.

- [ ] T001 Create root `package.json` with `"workspaces": ["packages/*"]`, dev deps (`@anthropic-ai/sdk`, `biome`, `bun-types`), and scripts (`build`, `test`, `check`) at `/package.json`
- [ ] T002 [P] Create root `tsconfig.json` with `strict: true`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `moduleResolution: "bundler"`, `types: ["bun-types"]`, and project references at `/tsconfig.json`
- [ ] T003 [P] Create root `biome.json` with recommended rules, `noExplicitAny: error`, `noNonNullAssertion: error`, `noUnusedVariables: error`, formatter settings at `/biome.json`
- [ ] T004 Create `packages/core/package.json` (`@chloe/core`, `private: true`) and `packages/core/tsconfig.json` (extends root) at `packages/core/`
- [ ] T005 [P] Create `packages/cli/package.json` (`@chloe/cli`, dep: `@chloe/core: workspace:*`) and `packages/cli/tsconfig.json` at `packages/cli/`
- [ ] T006 [P] Create `packages/api/package.json` (`@chloe/api`, dep: `@chloe/core: workspace:*`) and `packages/api/tsconfig.json` at `packages/api/`
- [ ] T007 Add placeholder `src/index.ts` (exports one empty const) to each of `packages/core/`, `packages/cli/`, `packages/api/`
- [ ] T008 Run `bun install` and verify workspace symlinks resolve; run `bunx biome check .` and `bun test` — both must exit 0

**Checkpoint**: `bun install && bunx biome check . && bun test` all pass. Workspace skeleton is ready.

---

## Phase 2: Foundational — Core Library (Blocks All User Stories)

**Purpose**: The `@chloe/core` library with storage, tool registry, ReAct loop, and session management. This MUST be complete before any CLI or API work begins.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

### 2a: Storage Layer

- [ ] T009 Define `StorageAdapter` interface with all methods (`createSession`, `getSession`, `listSessions`, `deleteSession`, `touchSession`, `appendMessage`, `getMessages`) in `packages/core/src/storage/adapter.ts`
- [ ] T010 [P] Define `Session`, `SessionSummary`, `Message` TypeScript types in `packages/core/src/session/types.ts`
- [ ] T011 Implement `SQLiteStorageAdapter` using `bun:sqlite` with DDL schema, WAL mode, foreign key pragmas, and all adapter methods in `packages/core/src/storage/sqlite.ts`; constructor MUST create parent directory (`~/.chloe/` or custom path) if absent before opening the database
- [ ] T012 [P] Implement `slugify()` and `validateSessionId()` with all rules (lowercase, special-char replacement, consecutive-hyphen collapse, trim, empty/length rejection) in `packages/core/src/session/slug.ts`
- [ ] T013 Write unit tests for `SQLiteStorageAdapter` using `:memory:` database (create/get/list/delete session, append/get messages, cascade delete) in `packages/core/src/storage/sqlite.test.ts`
- [ ] T014 [P] Write unit tests for `slugify()` and `validateSessionId()` (all slugification rules, edge cases, rejection cases) in `packages/core/src/session/slug.test.ts`

### 2b: Tool Registry

- [ ] T015 Define `Tool` interface (`name`, `description`, `inputSchema`, `execute`) in `packages/core/src/tools/types.ts`
- [ ] T016 Implement `ToolRegistry` (`register`, `get`, `list` returning Anthropic-shaped tool array) with duplicate-name error in `packages/core/src/tools/registry.ts`
- [ ] T017 [P] Implement `EchoTool` with input schema `{ message: string }` and execute returning message unchanged in `packages/core/src/tools/echo.ts`
- [ ] T018 Write unit tests for `ToolRegistry` (register + get, unknown returns null, list shape, duplicate error) in `packages/core/src/tools/registry.test.ts`
- [ ] T019 [P] Write unit tests for `EchoTool` (execute returns input) in `packages/core/src/tools/echo.test.ts`

### 2c: ReAct Agent Loop

- [ ] T020 Define `AgentConfig`, `AgentCallbacks` (including `confirmTool?`), `RunResult` types in `packages/core/src/agent/types.ts`
- [ ] T021 Implement `runLoop()` with full ReAct algorithm: stream text deltas, await `finalMessage()`, handle `tool_use` stop reason, call `confirmTool` callback, inject `tool_result` observations, loop until `end_turn` in `packages/core/src/agent/loop.ts`
- [ ] T022 Implement `createAgent()` / `Agent` class wrapping `runLoop()` with session history load/save in `packages/core/src/agent/agent.ts`
- [ ] T023 Write unit tests for `runLoop()` using mock Anthropic client stub: single turn no tools, tool call confirmed, tool call denied, multi-turn loop, unknown tool graceful handling in `packages/core/src/agent/loop.test.ts`

### 2d: Core Exports

- [ ] T024 Export all public APIs (`createAgent`, `Agent`, `StorageAdapter`, `SQLiteStorageAdapter`, `Tool`, `ToolRegistry`, `EchoTool`, all types) from `packages/core/src/index.ts`

**Checkpoint**: `bun test` passes all core unit tests. `bunx biome check .` clean. Core library is ready.

---

## Phase 3: User Story 1 — Named Session Chat via CLI (Priority: P1) 🎯 MVP

**Goal**: `chloe chat --session <name>` starts an interactive streaming REPL. New sessions are created; existing sessions resume with history. Tokens stream in real time.

**Independent Test**: Run `chloe chat --session demo`, send "Hello", observe streamed reply. Exit and re-run — prior context is recalled.

- [ ] T025 Implement `printToken(text)` and `printLine(text)` stdout helpers in `packages/cli/src/ui/stream.ts`
- [ ] T026 Implement `chatCommand({ session, yes })` with readline REPL loop, `Agent.run()` calls, streaming output via `onToken`, and clean exit on `exit` / Ctrl-C in `packages/cli/src/commands/chat.ts`
- [ ] T027 Implement CLI entry `packages/cli/src/index.ts` with `parseArgs()`, `ANTHROPIC_API_KEY` fast-fail check, and dispatch to `chatCommand` (stubs for `serveCommand` and `sessionsCommand` OK at this stage)
- [ ] T028 Wire `packages/cli` binary in `package.json` so `bun run packages/cli/src/index.ts chat --session demo` works
- [ ] T029 Wire `SQLiteStorageAdapter` with `CHLOE_DB_PATH` env var default (`~/.chloe/chloe.db`) and `EchoTool` registered; confirm chat command completes a full turn

**Checkpoint**: `chloe chat --session demo` → message sent → streamed response → session history saved → resume on re-run works. US1 independently functional.

---

## Phase 4: User Story 2 — Human-in-the-Loop Tool Confirmation (Priority: P2)

**Goal**: When the agent calls a tool, the user sees the tool name + arguments and must confirm (y/N) before execution. Denial is handled gracefully.

**Independent Test**: Prompt the agent to echo something. Confirmation prompt appears. Confirming executes tool. Denying skips tool gracefully.

- [ ] T030 Implement `confirm(toolName, input)` readline y/N prompt in `packages/cli/src/ui/confirm.ts`
- [ ] T031 Wire `confirmTool` callback into `chatCommand`: when not `--yes`, pass `confirm()` as `callbacks.confirmTool`; when `--yes`, pass a callback that always returns `true`
- [ ] T032 Manual test: run `chloe chat --session hitl-test`, send a message that triggers EchoTool, observe prompt, test confirm and deny paths

**Checkpoint**: Tool confirmation prompt appears; confirming executes EchoTool and output is visible; denying skips gracefully. US2 independently functional.

---

## Phase 5: User Story 3 — API Service with SSE Streaming (Priority: P3)

**Goal**: `chloe serve` starts an HTTP server. `POST /sessions/:id/messages` returns SSE-streamed tokens. `GET /sessions` and `DELETE /sessions/:id` work correctly.

**Independent Test**: `chloe serve` starts; `curl -N -X POST .../sessions/s1/messages -d '{"content":"Hello"}'` returns SSE stream.

- [ ] T033 Implement `POST /sessions/:id/messages` SSE handler with `ReadableStream`, `onToken` forwarding, `[DONE]` sentinel, auto-confirm tool calls (no HITL in API mode) in `packages/api/src/handlers/messages.ts`
- [ ] T034 [P] Implement `GET /sessions` handler returning JSON `SessionSummary[]` in `packages/api/src/handlers/sessions.ts`
- [ ] T035 [P] Implement `DELETE /sessions/:id` handler with 200/404 JSON responses in `packages/api/src/handlers/sessions.ts`
- [ ] T036 Implement router with URL pattern matching and 404/405 error responses in `packages/api/src/router.ts`
- [ ] T037 Implement `Bun.serve()` with port resolution (`--port` > `PORT` env > 3000) and startup log in `packages/api/src/index.ts`
- [ ] T038 Implement `serveCommand({ port })` in `packages/cli/src/commands/serve.ts` and wire into CLI dispatch

**Checkpoint**: `chloe serve` starts; all three API endpoints respond correctly; SSE stream observable with curl. US3 independently functional.

---

## Phase 6: User Story 4 — Session Management via CLI (Priority: P3)

**Goal**: `chloe sessions list` and `chloe sessions delete <id>` work correctly.

**Independent Test**: Create two sessions, list shows both, delete removes one, list confirms removal.

- [ ] T039 Implement `sessionsCommand({ subcommand, id })` with `list` (formatted table output) and `delete` (confirmation message or exit-1 error) in `packages/cli/src/commands/sessions.ts`
- [ ] T040 Wire `sessionsCommand` into CLI dispatch in `packages/cli/src/index.ts`

**Checkpoint**: `chloe sessions list` and `chloe sessions delete <id>` work. US4 independently functional.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Final integration, hardening, and verification.

- [ ] T041 Add SIGINT (Ctrl-C) handler to CLI chat command: flush partial response to session history, exit cleanly
- [ ] T042 Add 405 Method Not Allowed handling to API router for correct-path wrong-method requests
- [ ] T043 [P] Run `bun run build` (tsc --noEmit across all packages) — fix any type errors
- [ ] T044 [P] Run `bunx biome check --error-on-warnings .` — fix all linting/formatting issues
- [ ] T045 Run `bun test` — all unit tests pass with zero failures
- [ ] T046 Manual smoke test per quickstart.md: full conversation with EchoTool via CLI, API serve + curl SSE test, sessions list + delete

**Checkpoint**: `bun install && bunx biome check . && bun test` all pass. Manual smoke test passes. Feature complete.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Scaffolding)**: No dependencies — start immediately
- **Phase 2 (Core)**: Depends on Phase 1 — BLOCKS all user story phases
- **Phase 3 (US1)**: Depends on Phase 2 completion
- **Phase 4 (US2)**: Depends on Phase 3 (HITL wires into chat command)
- **Phase 5 (US3)**: Depends on Phase 2 completion — can run in parallel with Phase 3/4
- **Phase 6 (US4)**: Depends on Phase 2 completion — can run in parallel with other stories
- **Phase 7 (Polish)**: Depends on all story phases

### Parallel Opportunities

- T002, T003 (config files) can run in parallel with T001
- T005, T006 (cli/api package configs) can run in parallel
- Within Phase 2: storage layer (T009–T014) and tool registry (T015–T019) can run in parallel
- T010, T012, T014 can run in parallel with T011, T013
- Phase 5 (API) and Phase 3/4 (CLI) can be developed in parallel after Phase 2

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1 + Phase 2
2. Complete Phase 3 (US1)
3. **STOP and VALIDATE**: `chloe chat --session demo` works end-to-end
4. Proceed to US2, US3, US4 in priority order

### Incremental Delivery

1. Phase 1 → Phase 2 → Phase 3: Chat works ✅
2. → Phase 4: Tool confirmation works ✅
3. → Phase 5: API service works ✅
4. → Phase 6: Session management works ✅
5. → Phase 7: Polish + full verification ✅
