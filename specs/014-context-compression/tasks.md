# Tasks: Context Compression for Long Conversations

**Input**: Design documents from `/specs/014-context-compression/`  
**Prerequisites**: plan.md ✓, spec.md ✓, research.md ✓, data-model.md ✓, contracts/ ✓

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel (different files, no shared state)
- **[Story]**: User story tag (US1, US2, US3, US4) — omitted for Setup, Foundational, and Polish phases
- Exact file paths included in all task descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Establish a clean baseline before any changes.

- [ ] T001 Verify existing test suite passes: `bun test` from repo root (baseline before changes)
- [ ] T002 Verify Biome passes: `bunx biome check --error-on-warnings .` (baseline)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that ALL user stories depend on. No US work can begin until this phase is complete.

**⚠️ CRITICAL**: These tasks create the types, config, and storage primitives used by all four stories.

- [ ] T003 [P] Create `packages/core/src/agent/models.ts` — move `MODEL_CONTEXT_LIMITS` and `getContextLimit()` from `packages/cli/src/ui/types.ts` to core; update CLI import to re-export from core
- [ ] T004 [P] Add `CompressionInfo` interface and `onContextCompressed` optional callback to `packages/core/src/agent/types.ts`; add `contextCompression?: ContextCompressionConfig` to `AgentConfig`
- [ ] T005 [P] Add `ContextCompressionConfig` interface to `packages/core/src/config.ts`; add TOML parsing for `[context_compression]` section; add `CHLOE_CONTEXT_COMPRESSION_THRESHOLD` and `CHLOE_CONTEXT_COMPRESSION_KEEP_RECENT` env var support; wire into `loadConfig()`
- [ ] T006 [P] Add `summary: string | null` to `Session` interface in `packages/core/src/session/types.ts`; add `getSessionSummary(id): Promise<string | null>` and `setSessionSummary(id, summary): Promise<void>` to `StorageAdapter` in `packages/core/src/storage/adapter.ts`
- [ ] T007 Implement `getSessionSummary` and `setSessionSummary` in `packages/core/src/storage/sqlite.ts`; add `summary TEXT DEFAULT NULL` migration via try/catch `ALTER TABLE` (same pattern as `parent_id` and `subagent_type`); update `rowToSession()` to include `summary` field; update `createSession()` return to include `summary: null` (depends on T006)
- [ ] T008 Create `packages/core/src/agent/compressor.ts` with `compressIfNeeded()` function, `CompressResult` type, and `ContextTooLargeError` class; fast-path: return `null` immediately if `messages.length ≤ keepRecentCount` (avoids API call for short sessions, satisfies SC-006); otherwise call `client.messages.countTokens({ model, messages, system })`; generate summary using `fastModel` via `client.messages.create()`; throws on any failure with no silent fallback (FR-005); throws `ContextTooLargeError` if recent-only messages still overflow (depends on T003, T004)
- [ ] T009 Export `CompressionInfo`, `ContextTooLargeError`, `getContextLimit` from `packages/core/src/index.ts` (depends on T003, T004, T008)

**Checkpoint**: Foundation ready — storage, config, types, and compressor module all exist. User story work can now begin.

---

## Phase 3: User Story 1 - Seamless Long Session Continuation (Priority: P1) 🎯 MVP

**Goal**: When token count exceeds threshold, compression fires automatically and the session continues without error.

**Independent Test**: Create a session, fill it with messages until token count exceeds 75% of the context window (mock `countTokens` in tests), send one more message — verify no API failure and the response is coherent with prior content.

### Tests for User Story 1

> **Write tests FIRST; ensure they FAIL before implementing T012**

- [ ] T010 [P] [US1] Unit test: `compressIfNeeded()` returns `null` when token count is below threshold — in `packages/core/src/agent/compressor.test.ts`; mock `client.messages.countTokens` to return low count
- [ ] T011 [P] [US1] Unit test: `compressIfNeeded()` returns a `CompressResult` when token count exceeds threshold — mock `countTokens` and `messages.create`; assert `compressedCount`, `keptCount`, and rebuilt message array structure in `packages/core/src/agent/compressor.test.ts`

### Implementation for User Story 1

- [ ] T012 [US1] Inject compression check into `packages/core/src/agent/agent.ts` `Agent.run()`: call `compressIfNeeded()` after `messages.push(userContent)` and before `runLoop()` call; if result is non-null, replace `messages` array and call `callbacks.onContextCompressed?.()` (depends on T007, T008, and Phase 2 completion)

**Checkpoint**: User Story 1 complete — long sessions no longer fail with token-limit errors.

---

## Phase 4: User Story 2 - Persistent Summary Across Session Restarts (Priority: P2)

**Goal**: A compression summary written in one process is loaded and injected correctly in future processes running the same session.

**Independent Test**: Trigger compression, exit chloe, start a new process with the same session ID, ask about content from the compressed portion — verify coherent response.

### Tests for User Story 2

> **Write tests FIRST; ensure they FAIL before implementing T015**

- [ ] T013 [P] [US2] Unit test: `SQLiteStorageAdapter.getSessionSummary()` returns `null` for a session with no summary — in `packages/core/src/storage/sqlite.test.ts`
- [ ] T014 [P] [US2] Unit test: `SQLiteStorageAdapter.setSessionSummary()` persists text and `getSessionSummary()` retrieves it; verify summary survives DB close/reopen using a temp file path — in `packages/core/src/storage/sqlite.test.ts`

### Implementation for User Story 2

- [ ] T015 [US2] Add summary load-and-prepend logic in `packages/core/src/agent/agent.ts` `Agent.run()`: call `storage.getSessionSummary(sessionId)` after loading history; if non-null, `messages.unshift(summaryUserMsg, summaryAssistantAck)` before the token count check (depends on T007, T012)
- [ ] T016 [US2] Persist the new summary after successful compression in `packages/core/src/agent/agent.ts` `Agent.run()`: call `storage.setSessionSummary(sessionId, summaryText)` after `compressIfNeeded()` returns a non-null result (depends on T015)

**Checkpoint**: User Stories 1 AND 2 complete — compression persists across process restarts.

---

## Phase 5: User Story 3 - User Visibility of Compression Events (Priority: P3)

**Goal**: When compression occurs, a visible in-conversation notification appears in the CLI and persists in the scrollback.

**Independent Test**: Trigger a compression event in the CLI; verify a distinctly colored system notification is visible with correct message count information.

### Tests for User Story 3

> **Write tests FIRST; ensure they FAIL before implementing T019**

- [ ] T017 [P] [US3] Unit test: `getContextLimit()` returns 200,000 for known model prefixes and also for unknown/custom model names — in `packages/core/src/agent/models.test.ts`
- [ ] T018 [P] [US3] Unit test: `MessageBubble` renders a `"system"` role message with label `"System"` and color `"yellow"` — in `packages/cli/src/ui/MessageBubble.test.tsx` (skip if no Ink test infra; document as manual test)

### Implementation for User Story 3

- [ ] T019 [P] [US3] Add `"system"` to `MessageRole` union in `packages/cli/src/ui/types.ts`; remove duplicate `getContextLimit` definition and re-export it from `@chloe/core` instead (depends on T003)
- [ ] T020 [P] [US3] Add `"system"` cases to `roleLabel()` (returns `"System"`) and `roleColor()` (returns `"yellow"`) in `packages/cli/src/ui/MessageBubble.tsx` (depends on T019)
- [ ] T021 [US3] Wire `onContextCompressed` callback in `packages/cli/src/ui/App.tsx` `handleSubmit`: push a system-role `ChatMessage` to messages state; notification text: `"⚠️ Context compressed: {compressedCount} earlier messages were summarized. The most recent {keptCount} messages are preserved in full."` (depends on T019, T020, and Phase 2 completion)

**Checkpoint**: User Stories 1–3 complete. Compression fires, persists, and is visible to the user.

---

## Phase 6: User Story 4 - Manual `/compact` Command (Priority: P4)

**Goal**: Users can type `/compact` at any time to proactively compress their session history.

**Independent Test**: In any session with messages, type `/compact`. Verify a compression notification appears, the summary is persisted, and the next response references earlier content. Also verify `/compact` on an empty session gives a friendly message.

### Tests for User Story 4

> **Write tests FIRST; ensure they FAIL before implementing T024**

- [ ] T022 [P] [US4] Unit test: `Agent.forceCompress()` calls `compressIfNeeded` with `threshold: 0`, persists the returned summary, and fires `onContextCompressed` callback — in `packages/core/src/agent/agent.test.ts`; use in-memory SQLite and mocked Anthropic client
- [ ] T023 [P] [US4] Unit test: `Agent.forceCompress()` on a session with zero messages returns without error and makes no API calls — in `packages/core/src/agent/agent.test.ts`

### Implementation for User Story 4

- [ ] T024 [US4] Add `forceCompress(sessionId, callbacks)` public method to `Agent` class in `packages/core/src/agent/agent.ts`: load messages, prepend existing summary if present, call `compressIfNeeded()` with `threshold: 0` to bypass token check, persist via `storage.setSessionSummary()`, fire `callbacks.onContextCompressed` (depends on T007, T008, and Phase 2 completion)
- [ ] T025 [US4] Handle `/compact` command in `packages/cli/src/ui/App.tsx` `handleSubmit`: intercept `text.trim() === "/compact"` before the `routeCommand()` call; if no messages, push a friendly assistant response; otherwise set status to `"thinking"`, call `agent.forceCompress()` with `onContextCompressed` callback, then restore status to `"idle"` (depends on T019, T020, T024)
- [ ] T026 [US4] Add `{ name: "compact", description: "Summarize and compress session history", isCommand: true }` to `INTERNAL_PALETTE` in `packages/cli/src/ui/App.tsx` so it appears in the slash-command autocomplete palette (depends on T025)

**Checkpoint**: All four user stories complete.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [ ] T027 [P] Add `ContextTooLargeError` handling in `packages/cli/src/ui/App.tsx` `handleSubmit` catch block — display a specific user-facing message: `"Session is too large to compress. Even the most recent messages exceed the context limit."` (distinct from the generic error path)
- [ ] T028 [P] Validate config values in `packages/core/src/config.ts`: `threshold` must be `0 < x < 1`, `keepRecentCount` must be `≥ 1`; revert each invalid value to its default with a `warn`-level log message
- [ ] T029 [P] Wire `contextCompression` config from `loadConfig()` into `AgentConfig` in `packages/cli/src/commands/chat.ts` (line ~107, `createAgent()` call) and in `packages/api/src/router.ts`
- [ ] T030 Run full test suite: `bun test` — all tests must pass
- [ ] T031 Run Biome: `bunx biome check --error-on-warnings .` — zero warnings/errors
- [ ] T032 Run type check: `bunx tsc --noEmit -p tsconfig.check.json` — zero errors

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately
- **Phase 2 (Foundational)**: Depends on Phase 1 — **BLOCKS all user stories**
  - T003, T004, T005, T006: parallel
  - T007: depends on T006
  - T008: depends on T003, T004
  - T009: depends on T003, T004, T008
- **Phase 3 (US1)**: Requires Phase 2 complete
  - T010, T011: parallel (write before T012)
  - T012: depends on T010, T011
- **Phase 4 (US2)**: Requires Phase 2 complete; T015 requires T012
  - T013, T014: parallel
  - T015: depends on T013, T014, T012
  - T016: depends on T015
- **Phase 5 (US3)**: Requires Phase 2 complete
  - T017, T018, T019, T020: parallel
  - T021: depends on T019, T020
- **Phase 6 (US4)**: Requires Phase 2 complete; T025 requires T024
  - T022, T023: parallel (write before T024)
  - T024: depends on T022, T023
  - T025: depends on T019, T020, T024
  - T026: depends on T025
- **Phase 7 (Polish)**: Requires all story phases complete
  - T027, T028, T029: parallel
  - T030, T031, T032: sequential (run after all changes)

### Parallel Opportunities

**Phase 2 initial batch:**
- T003: `agent/models.ts`
- T004: `agent/types.ts`
- T005: `config.ts`
- T006: `storage/adapter.ts` + `session/types.ts`

**Phase 5 initial batch:**
- T017: `models.test.ts`
- T018: `MessageBubble.test.tsx`
- T019: `ui/types.ts`
- T020: `MessageBubble.tsx`

---

## Parallel Example: Phase 2

```
Task: "Create packages/core/src/agent/models.ts" (T003)
Task: "Extend packages/core/src/agent/types.ts" (T004)
Task: "Extend packages/core/src/config.ts" (T005)
Task: "Extend StorageAdapter + Session types" (T006)
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 — baseline verification
2. Phase 2 — foundational infrastructure
3. Phase 3 — US1: auto-compression
4. **STOP and VALIDATE**: Long sessions no longer fail
5. Merge as MVP

### Incremental Delivery

1. Phase 1 + 2 → Foundation ready
2. Phase 3 → US1: sessions don't fail ← **MVP**
3. Phase 4 → US2: summaries persist across restarts
4. Phase 5 → US3: users see notifications
5. Phase 6 → US4: `/compact` manual command
6. Phase 7 → Polish and final validation

---

## Notes

- [P] tasks touch different files with no shared state — safe to parallelize
- Unit tests MUST be written before implementation (RED before GREEN per constitution)
- `compressor.ts` is the critical path — mock the Anthropic client in all tests
- `getSessionSummary` is called every turn intentionally: existing summaries are prepended before re-checking the token count, enabling natural re-compression (FR-011)
- `/compact` intercept must happen BEFORE `routeCommand()` in `App.tsx` since `routeCommand()` has no access to the agent or session storage
- Avoid modifying `loop.ts` — all compression logic belongs in `agent.ts` and `compressor.ts`
