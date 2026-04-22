# Tasks: Context Compression for Long Conversations

**Input**: Design documents from `/specs/014-context-compression/`  
**Prerequisites**: plan.md ✓, spec.md ✓, research.md ✓, data-model.md ✓, contracts/ ✓

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: User story tag (US1, US2, US3, FOUND)
- Exact file paths included in all task descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: No new setup required — monorepo and tooling already configured.

- [ ] T001 Verify existing test suite passes: `bun test` from repo root (baseline before changes)
- [ ] T002 Verify Biome passes: `bunx biome check --error-on-warnings .` (baseline)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that ALL user stories depend on. No US work can begin until this phase is complete.

**⚠️ CRITICAL**: These tasks create the types, config, and storage primitives used by all three stories.

- [ ] T003 [P] [FOUND] Create `packages/core/src/agent/models.ts` — move `MODEL_CONTEXT_LIMITS` and `getContextLimit()` from `packages/cli/src/ui/types.ts` to core; update CLI import to re-export from core
- [ ] T004 [P] [FOUND] Add `CompressionInfo` interface and `onContextCompressed` callback to `packages/core/src/agent/types.ts`; add `contextCompression?: ContextCompressionConfig` to `AgentConfig`
- [ ] T005 [P] [FOUND] Add `ContextCompressionConfig` interface to `packages/core/src/config.ts`; add TOML parsing for `[context_compression]` section; add `CHLOE_CONTEXT_COMPRESSION_THRESHOLD` and `CHLOE_CONTEXT_COMPRESSION_KEEP_RECENT` env var support; wire into `loadConfig()`
- [ ] T006 [P] [FOUND] Add `summary: string | null` to `Session` interface in `packages/core/src/session/types.ts`; add `getSessionSummary(id): Promise<string | null>` and `setSessionSummary(id, summary): Promise<void>` to `StorageAdapter` in `packages/core/src/storage/adapter.ts`
- [ ] T007 [FOUND] Implement `getSessionSummary` and `setSessionSummary` in `packages/core/src/storage/sqlite.ts`; add `summary TEXT DEFAULT NULL` migration (try/catch ALTER TABLE pattern, same as `parent_id`); update `rowToSession()` to include `summary` field; update `createSession()` return to include `summary: null` (depends on T006)
- [ ] T008 [FOUND] Create `packages/core/src/agent/compressor.ts` with `compressIfNeeded()` function, `CompressResult` type, and `ContextTooLargeError` class; fast-path: return `null` immediately if `messages.length ≤ keepRecentCount` (avoids API call for short sessions, satisfies SC-006); otherwise call `client.messages.countTokens()`; summarization prompt using `fastModel`; throws on any failure with no silent fallback (FR-005); throws `ContextTooLargeError` if recent-only still overflows (depends on T003, T004)
- [ ] T009 [FOUND] Export `CompressionInfo`, `ContextTooLargeError`, `getContextLimit` from `packages/core/src/index.ts` (depends on T003, T004, T008)

**Checkpoint**: Foundation ready — storage, config, types, and compressor module all exist. User story work can now begin.

---

## Phase 3: User Story 1 - Seamless Long Session Continuation (Priority: P1) 🎯 MVP

**Goal**: When a session's token count exceeds the threshold, compression fires automatically and the session continues without error.

**Independent Test**: Create a session, send messages until token count exceeds 75% of the model's context window limit (can use small models or mock `countTokens`), send one more message — verify no API failure and the response is coherent.

### Tests for User Story 1

> **Write tests FIRST; ensure they FAIL before implementing T012**

- [ ] T010 [P] [US1] Unit test: `compressIfNeeded()` returns `null` when token count is below threshold — in `packages/core/src/agent/compressor.test.ts`; mock `client.messages.countTokens` to return low count
- [ ] T011 [P] [US1] Unit test: `compressIfNeeded()` returns `CompressResult` when token count exceeds threshold — mock `countTokens` and `messages.create`; assert `compressedCount`, `keptCount`, and rebuilt message array shape

### Implementation for User Story 1

- [ ] T012 [US1] Inject compression check into `packages/core/src/agent/agent.ts` `Agent.run()`: call `compressIfNeeded()` after `messages.push(userContent)` and before `runLoop()` call; if result is non-null, replace `messages` array and call `callbacks.onContextCompressed?.()` (depends on T007, T008, Phase 2)

**Checkpoint**: User Story 1 complete — long sessions no longer fail with token-limit errors.

---

## Phase 4: User Story 2 - Persistent Summary Across Session Restarts (Priority: P2)

**Goal**: A compression summary written in one process is loaded and injected in future processes running the same session.

**Independent Test**: Trigger compression (run US1 path), exit the process, create a new `Agent` instance with the same session ID, ask about content from the compressed portion — verify coherent response.

### Tests for User Story 2

> **Write tests FIRST; ensure they FAIL before implementing T015**

- [ ] T013 [P] [US2] Unit test: `SQLiteStorageAdapter.getSessionSummary()` returns `null` for a session with no summary — in `packages/core/src/storage/sqlite.test.ts`
- [ ] T014 [P] [US2] Unit test: `SQLiteStorageAdapter.setSessionSummary()` persists summary and `getSessionSummary()` retrieves it; also verify summary survives DB close/reopen (in-memory DB limitation: use temp file)

### Implementation for User Story 2

- [ ] T015 [US2] Add summary load-and-prepend logic in `packages/core/src/agent/agent.ts` `Agent.run()`: call `storage.getSessionSummary(sessionId)` after loading history; if summary exists, `messages.unshift(summaryUserMsg, summaryAssistantAck)` before token count check (depends on T007, T012)
- [ ] T016 [US2] Persist the new summary after successful compression in `Agent.run()`: call `storage.setSessionSummary(sessionId, summaryText)` after `compressIfNeeded()` returns a non-null result (depends on T015)

**Checkpoint**: User Stories 1 AND 2 complete — compression persists across process restarts.

---

## Phase 5: User Story 3 - User Visibility of Compression Events (Priority: P3)

**Goal**: When compression occurs, a visible in-conversation notification appears in the CLI and persists in the scrollback.

**Independent Test**: Trigger compression in the CLI; verify a distinctly colored system notification message is visible with the correct message count information.

### Tests for User Story 3

> **Write tests FIRST; ensure they FAIL before implementing T019**

- [ ] T017 [P] [US3] Unit test: `getContextLimit()` returns 200,000 for known model prefixes and for unknown models — in `packages/core/src/agent/models.test.ts`
- [ ] T018 [P] [US3] Unit test: `MessageBubble` renders `"system"` role messages with correct label and color — in `packages/cli/src/ui/MessageBubble.test.tsx` (if test infra for Ink components exists; otherwise manual test)

### Implementation for User Story 3

- [ ] T019 [P] [US3] Add `"system"` to `MessageRole` union in `packages/cli/src/ui/types.ts`; remove duplicate `getContextLimit` definition (now re-exported from core) (depends on T003)
- [ ] T020 [P] [US3] Add `"system"` cases to `roleLabel()` and `roleColor()` in `packages/cli/src/ui/MessageBubble.tsx` — label: `"System"`, color: `"yellow"` (depends on T019)
- [ ] T021 [US3] Wire `onContextCompressed` callback in `packages/cli/src/ui/App.tsx` `handleSubmit`: push a system-role `ChatMessage` with the notification text; format: `"⚠️ Context compressed: {N} earlier messages were summarized. The most recent {K} messages are preserved in full."` (depends on T019, T020, Phase 2)

**Checkpoint**: All three user stories complete. Compression fires, persists, and is visible to the user.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [ ] T022 [P] Add `ContextTooLargeError` handling in `packages/cli/src/ui/App.tsx` `handleSubmit` catch block — display a specific user-facing error message distinct from generic errors
- [ ] T023 [P] Validate `contextCompression.threshold` (must be 0 < x < 1) and `keepRecentCount` (must be ≥ 1) in `packages/core/src/config.ts`; revert to defaults with a warning log if invalid
- [ ] T024 [P] Add `contextCompression` config to `AgentConfig` wiring in `packages/cli/src/commands/chat.ts` (line ~107 where `createAgent()` is called) and in `packages/api/src/router.ts`
- [ ] T025 Run full test suite: `bun test` — all tests must pass
- [ ] T026 Run Biome: `bunx biome check --error-on-warnings .` — zero warnings/errors
- [ ] T027 Run type check: `bunx tsc --noEmit -p tsconfig.check.json` — zero errors

---

## Phase 5b: User Story 4 - Manual `/compact` Command (Priority: P4)

**Goal**: Users can type `/compact` to proactively compress their session at any time.

**Independent Test**: In any session with messages, type `/compact`. Verify a compression notification appears, the summary is persisted to storage, and subsequent responses reference earlier content correctly. Also verify `/compact` on an empty session gives a friendly message rather than an error.

### Tests for User Story 4

> **Write tests FIRST; ensure they FAIL before implementing T029**

- [ ] T028 [P] [US4] Unit test: `Agent.forceCompress()` with a mocked client calls `compressIfNeeded` with `threshold: 0` and persists the summary — in `packages/core/src/agent/agent.test.ts`
- [ ] T029 [P] [US4] Unit test: `Agent.forceCompress()` on a session with zero messages returns without error and does not call the API — in `packages/core/src/agent/agent.test.ts`

### Implementation for User Story 4

- [ ] T030 [US4] Add `forceCompress(sessionId, callbacks)` method to `Agent` class in `packages/core/src/agent/agent.ts`; passes `threshold: 0` to `compressIfNeeded()` to bypass token check; loads existing summary and prepends it; calls `storage.setSessionSummary()` and fires `callbacks.onContextCompressed` (depends on T007, T008, Phase 2)
- [ ] T031 [US4] Handle `/compact` command in `packages/cli/src/ui/App.tsx` `handleSubmit`: detect `text.trim() === "/compact"` before the routing logic; if session has no messages, respond with friendly message; otherwise call `agent.forceCompress()` with `onContextCompressed` callback; set status to `"thinking"` during call (depends on T019, T020, T030)
- [ ] T032 [US4] Add `/compact` to `INTERNAL_PALETTE` in `packages/cli/src/ui/App.tsx` so it appears in the slash-command autocomplete (depends on T031)

**Checkpoint**: All four user stories complete.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — can start immediately
- **Phase 2 (Foundational)**: Depends on Phase 1 — BLOCKS all user stories
  - T003, T004, T005, T006 can run in parallel
  - T007 depends on T006
  - T008 depends on T003, T004
  - T009 depends on T003, T004, T008
- **Phase 3 (US1)**: Depends on Phase 2 completion
  - T010, T011 can run in parallel (write before T012)
  - T012 depends on T010, T011, and Phase 2
- **Phase 4 (US2)**: Depends on Phase 2; integrates with Phase 3 (T012 needed for T015)
  - T013, T014 can run in parallel
  - T015 depends on T013, T014, T012
  - T016 depends on T015
- **Phase 5 (US3)**: Depends on Phase 2; T021 depends on T019+T020
  - T017, T018, T019, T020 can run in parallel
  - T021 depends on T019, T020, and Phase 2
- **Phase 5b (US4)**: Depends on Phase 2 and T008; T028, T029 parallel
  - T030 depends on T007, T008
  - T031 depends on T019, T020, T030
  - T032 depends on T031
- **Phase 6 (Polish)**: Depends on all story phases complete

### Parallel Opportunities

All [P]-tagged tasks within a phase can execute simultaneously. Key parallel batches:

**Phase 2 initial batch (all parallel):**
- T003: models.ts creation
- T004: types.ts extension
- T005: config.ts extension
- T006: adapter.ts + session/types.ts extension

**Phase 5 initial batch (all parallel):**
- T017: models.test.ts
- T018: MessageBubble test
- T019: types.ts system role
- T020: MessageBubble.tsx cases

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

1. Complete Phase 1 (baseline check)
2. Complete Phase 2 (foundational)
3. Complete Phase 3 (US1 — core compression)
4. **STOP and VALIDATE**: Long sessions continue without token-limit errors
5. Merge as MVP

### Incremental Delivery

1. Phase 1 + 2 → Foundation ready
2. Phase 3 → US1 done: sessions don't fail ← **MVP**
3. Phase 4 → US2 done: summaries persist across restarts
4. Phase 5 → US3 done: users see notifications
5. Phase 6 → Polish and validation

---

## Notes

- [P] tasks = different files, no shared state
- Unit tests MUST be written before implementation (RED before GREEN)
- `compressor.ts` is the heart of this feature — test it thoroughly with mocked API calls
- The `getSessionSummary` call on every turn is intentional: it prepends any prior summary before re-checking token count, enabling incremental re-compression
- Avoid modifying `runLoop.ts` — all compression logic belongs in `agent.ts`
