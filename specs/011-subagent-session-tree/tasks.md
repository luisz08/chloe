# Tasks: Subagent Session Tree

**Input**: Design documents from `/specs/011-subagent-session-tree/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/agent-api.md, quickstart.md

**Organization**: Tasks grouped by user story to enable independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)
- Paths follow monorepo structure: `packages/core/`, `packages/cli/`, `packages/api/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Type extensions and DDL changes that all user stories depend on

- [X] T001 Extend Session type with parentId and subagentType fields in packages/core/src/session/types.ts
- [X] T002 [P] Add SubagentRequestContent and SubagentResponseContent types in packages/core/src/session/types.ts
- [X] T003 [P] Add SessionTree type in packages/core/src/session/types.ts
- [X] T004 Extend StorageAdapter interface with new methods in packages/core/src/storage/adapter.ts
- [X] T005 Update DDL in SQLiteStorageAdapter to add parent_id and subagent_type columns in packages/core/src/storage/sqlite.ts
- [X] T006 [P] Create index idx_sessions_parent_id in packages/core/src/storage/sqlite.ts

**Checkpoint**: Types and schema extended - storage implementation can begin

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core storage implementation that MUST complete before ANY user story work

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T007 Implement createChildSession method in SQLiteStorageAdapter in packages/core/src/storage/sqlite.ts
- [X] T008 [P] Implement getChildSessions method in SQLiteStorageAdapter in packages/core/src/storage/sqlite.ts
- [X] T009 [P] Implement listSessionsByType method in SQLiteStorageAdapter in packages/core/src/storage/sqlite.ts
- [X] T010 Implement getSessionTree method with recursive CTE in SQLiteStorageAdapter in packages/core/src/storage/sqlite.ts
- [X] T011 Implement ToolContext interface in packages/core/src/tools/types.ts
- [X] T012 Extend Tool execute signature to accept optional ToolContext in packages/core/src/tools/types.ts

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - Debug Subagent Call History (Priority: P1) 🎯 MVP

**Goal**: Developer can trace subagent call history with complete request/response and metadata

**Independent Test**: Trigger a subagent call (e.g., vision_analyze), then query its child session and verify messages contain prompt, response, tokens, model, elapsed_ms

### Tests for User Story 1

- [X] T013 [P] [US1] Add test for child session creation on subagent call in packages/core/src/tools/subagent.test.ts
- [X] T014 [P] [US1] Add test for metadata persistence (tokens, model, elapsed) in packages/core/src/tools/subagent.test.ts
- [X] T015 [US1] Add test for error handling (session created, error persisted) in packages/core/src/tools/subagent.test.ts

### Implementation for User Story 1

- [X] T016 [US1] Modify vision_analyze tool to create child session and persist messages in packages/core/src/tools/subagent.ts
- [X] T017 [P] [US1] Modify fast_query tool to create child session and persist messages in packages/core/src/tools/subagent.ts
- [X] T018 [P] [US1] Modify deep_reasoning tool to create child session and persist messages in packages/core/src/tools/subagent.ts
- [X] T019 [US1] Pass ToolContext from Agent to tool execute in packages/core/src/agent/agent.ts
- [X] T020 [US1] Add storage tests for child session retrieval in packages/core/src/storage/sqlite.test.ts

**Checkpoint**: User Story 1 complete - subagent calls create child sessions with full metadata, independently testable

---

## Phase 4: User Story 2 - View Session Hierarchy (Priority: P2)

**Goal**: Developer can view session tree hierarchy via CLI and API

**Independent Test**: Create session with multiple subagent calls, run `chloe sessions --tree` and verify tree structure displayed

### Tests for User Story 2

- [X] T021 [P] [US2] Add test for getChildSessions returning empty array in packages/core/src/storage/sqlite.test.ts
- [X] T022 [P] [US2] Add test for getSessionTree with nested children in packages/core/src/storage/sqlite.test.ts
- [X] T023 [US2] Add test for tree display in packages/cli/src/commands/sessions.test.ts (if exists)

### Implementation for User Story 2

- [X] T024 [US2] Add --tree flag to sessions CLI command in packages/cli/src/commands/sessions.ts
- [X] T025 [P] [US2] Add --children flag to sessions CLI command in packages/cli/src/commands/sessions.ts
- [X] T026 [P] [US2] Add GET /sessions/:id/children route in packages/api/src/router.ts
- [X] T027 [US2] Implement handleGetChildren handler in packages/api/src/handlers/sessions.ts
- [X] T028 [P] [US2] Add GET /sessions/:id/tree route in packages/api/src/router.ts
- [X] T029 [US2] Implement handleGetTree handler in packages/api/src/handlers/sessions.ts
- [X] T030 [US2] Implement tree display format (indented hierarchy) in packages/cli/src/commands/sessions.ts

**Checkpoint**: User Story 2 complete - CLI and API provide session hierarchy views

---

## Phase 5: User Story 3 - Replay Subagent Conversation (Priority: P3)

**Goal**: Developer can query subagent session messages as standalone conversation

**Independent Test**: Query a subagent session's messages, verify chronological order with preserved content (image path for vision, full text response)

### Tests for User Story 3

- [X] T031 [P] [US3] Add test for message retrieval from child session in packages/core/src/storage/sqlite.test.ts
- [X] T032 [US3] Add test for image content preservation in vision_analyze child session in packages/core/src/tools/subagent.test.ts

### Implementation for User Story 3

- [X] T033 [US3] Ensure getMessages returns SubagentRequestContent and SubagentResponseContent properly typed in packages/core/src/storage/sqlite.ts
- [X] T034 [P] [US3] Add message type guards for SubagentRequestContent/SubagentResponseContent in packages/core/src/session/types.ts
- [X] T035 [US3] Verify vision_analyze preserves image path/URL in request content in packages/core/src/tools/subagent.ts

**Checkpoint**: User Story 3 complete - subagent conversations replayable with full content

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Cleanup, validation, and documentation

- [X] T036 Run all tests and verify 100% pass with bun test
- [X] T037 [P] Run biome check --error-on-warnings and fix any issues
- [X] T038 Verify backward compatibility: existing sessions still work with null parentId
- [X] T039 Run quickstart.md testing checklist validation
- [X] T040 [P] Add --type flag to sessions CLI for filtering by subagent_type in packages/cli/src/commands/sessions.ts

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup (T001-T006) - BLOCKS all user stories
- **User Stories (Phase 3-5)**: All depend on Foundational phase completion
  - US1 (P1) can start after Phase 2
  - US2 (P2) can start after Phase 2 (independent of US1)
  - US3 (P3) can start after Phase 2 (independent of US1, US2)
- **Polish (Phase 6)**: Depends on desired user stories complete

### User Story Dependencies

- **User Story 1 (P1)**: Depends on Phase 2 - No dependencies on other stories
- **User Story 2 (P2)**: Depends on Phase 2 - Uses storage methods from US1 but storage is in Phase 2
- **User Story 3 (P3)**: Depends on Phase 2 - Uses message retrieval, independent

### Within Each User Story

- Tests before implementation
- Core tool modifications (T016-T018) can run in parallel after T019
- Agent integration (T019) must complete before tool modifications
- Handlers (T027, T029) depend on routes (T026, T028)

### Parallel Opportunities

| Phase | Parallel Tasks |
|-------|----------------|
| Setup | T002, T003; T005, T006 |
| Foundational | T008, T009; T011, T012 |
| US1 Tests | T013, T014; T017, T018 after T016 |
| US2 Tests | T021, T022; T024, T025; T026, T028 |
| US3 Tests | T031; T033, T034 |
| Polish | T037, T040 |

---

## Parallel Example: User Story 1

```bash
# After T019 (Agent integration) completes:
# Launch tool modifications in parallel:
Task: "Modify vision_analyze tool in packages/core/src/tools/subagent.ts"
Task: "Modify fast_query tool in packages/core/src/tools/subagent.ts"
Task: "Modify deep_reasoning tool in packages/core/src/tools/subagent.ts"

# Tests can run in parallel:
Task: "Add test for child session creation in packages/core/src/tools/subagent.test.ts"
Task: "Add test for metadata persistence in packages/core/src/tools/subagent.test.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (types, DDL)
2. Complete Phase 2: Foundational (storage methods, ToolContext)
3. Complete Phase 3: User Story 1 (subagent session creation)
4. **STOP and VALIDATE**: Test subagent call creates child session with metadata
5. Deploy/demo: Developer can debug subagent calls

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. Add US1 → Debug subagent history → Deploy (MVP!)
3. Add US2 → View hierarchy via CLI/API → Deploy
4. Add US3 → Replay conversations → Deploy
5. Polish → Cleanup, validation

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together
2. Once Foundational done:
   - Developer A: User Story 1 (tool modifications, tests)
   - Developer B: User Story 2 (CLI flags, API routes)
   - Developer C: User Story 3 (message retrieval validation)
3. Stories integrate independently at checkpoints

---

## Task Summary

| Phase | Task Count | Parallel Tasks |
|-------|------------|----------------|
| Setup | 6 | 4 |
| Foundational | 6 | 4 |
| US1 | 8 | 5 |
| US2 | 10 | 6 |
| US3 | 5 | 3 |
| Polish | 5 | 2 |
| **Total** | **40** | **24 parallelizable** |

**MVP Scope**: Phase 1 + Phase 2 + Phase 3 (US1) = 20 tasks

---

## Notes

- All tasks follow checklist format: checkbox, ID, optional [P], optional [Story], description with file path
- [P] tasks = different files, no shared mutable state
- [Story] label maps task to specific user story
- Each user story independently testable at checkpoint
- Tests OPTIONAL per spec - included here as TDD recommended for storage contracts
- Commit after each task or logical group
- Stop at checkpoints to validate independently