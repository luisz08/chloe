# Tasks: Multi-Model Routing System

**Input**: Design documents from `/specs/009-multi-model-routing/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Included per constitution requirement for unit tests of important logic.

**Organization**: Tasks grouped by user story to enable independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3, US4, US5)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project structure updates and type definitions

- [X] T001 Add routing types to packages/core/src/agent/types.ts (RouteTokenType, RoutingState, ImageInput, RouteDetectionResult)
- [X] T002 [P] Add ROUTING_SYSTEM_PROMPT constant to packages/core/src/agent/router.ts
- [X] T003 [P] Add ROUTE_TOKENS and MAX_ROUTE_SWITCHES constants to packages/core/src/agent/router.ts

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Config changes needed by ALL user stories - MUST complete before any user story work

**⚠️ CRITICAL**: No user story implementation can begin until config changes are complete

- [X] T004 Update ProviderConfig interface in packages/core/src/config.ts (add defaultModel, reasoningModel, fastModel, visionModel fields)
- [X] T005 Update DEFAULTS constant in packages/core/src/config.ts (change model to defaultModel)
- [X] T006 Add model fallback resolution in packages/core/src/config.ts (reasoningModel/fastModel/visionModel fallback to defaultModel)
- [X] T007 Update env var parsing in packages/core/src/config.ts (CHLOE_DEFAULT_MODEL, CHLOE_REASONING_MODEL, CHLOE_FAST_MODEL, CHLOE_VISION_MODEL)
- [X] T008 Update TOML field parsing in packages/core/src/config.ts (default_model, reasoning_model, fast_model, vision_model)
- [X] T009 Update setConfigInFile in packages/core/src/config.ts (add new model config keys)
- [X] T010 Update writeConfig in packages/core/src/config.ts (write new model fields)
- [X] T011 [P] Write config resolution tests in packages/core/src/config.test.ts

**Checkpoint**: Config system ready - user story implementation can begin

---

## Phase 3: User Story 1 - Basic Text Request Routing (Priority: P1) 🎯 MVP

**Goal**: Text-only messages route based on detected route tokens ([REASONING], [FAST], [VISION]) at line start

**Independent Test**: Send text messages, verify route token detection triggers model switch

### Tests for User Story 1

- [X] T012 [P] [US1] Write RouteDetector unit tests in packages/core/src/agent/route-detector.test.ts (line start detection, buffer handling)
- [X] T012a [P] [US1] Write empty response handling tests in packages/core/src/agent/loop.test.ts (empty after route token, regeneration logic)

### Implementation for User Story 1

- [X] T014 [P] [US1] Implement RouteDetector in packages/core/src/agent/route-detector.ts (detectInStream, checkLineStart, reset methods)
- [X] T015 [US1] Implement ModelRouter basic methods in packages/core/src/agent/router.ts (resolveModelConfig, selectInitialModel for text, resolveTargetModel)
- [X] T016 [US1] Create routingRunLoop function in packages/core/src/agent/loop.ts (wrap existing runLoop, add route detection)
- [X] T016a [US1] Add empty response handling in packages/core/src/agent/loop.ts (if target model outputs empty, attempt regeneration; log warning if still empty)
- [X] T017 [US1] Add route switch handling in packages/core/src/agent/loop.ts (abort stream, increment routeCount, restart with new model)
- [X] T018 [US1] Add MAX_ROUTE_SWITCHES enforcement in packages/core/src/agent/loop.ts (force default_model after limit)
- [X] T019 [US1] Update Agent class in packages/core/src/agent/agent.ts (use routingRunLoop, pass ResolvedModelConfig)

**Checkpoint**: User Story 1 functional - text routing works independently

---

## Phase 4: User Story 2 - Image Input Routing (Priority: P1)

**Goal**: Image inputs (paths/URLs) pre-route to vision_model, bypass route token detection

**Independent Test**: Send messages with image paths/URLs, verify vision_model used directly

### Tests for User Story 2

- [X] T020 [P] [US2] Write ImageInputProcessor unit tests in packages/core/src/agent/image-input.test.ts (path/URL detection, extension matching)
- [X] T020a [P] [US2] Write invalid image handling tests in packages/core/src/agent/image-input.test.ts (graceful degradation, warning logs)

### Implementation for User Story 2

- [X] T021 [P] [US2] Implement ImageInputProcessor.detect in packages/core/src/agent/image-input.ts (regex for paths and URLs)
- [X] T021a [US2] Add invalid image handling in packages/core/src/agent/image-input.ts (log warning, skip invalid paths/URLs, continue with text-only)
- [X] T022 [US2] Implement ImageInputProcessor.toContentBlocks in packages/core/src/agent/image-input.ts (base64 for local, URL for remote)
- [X] T023 [US2] Update ModelRouter.selectInitialModel in packages/core/src/agent/router.ts (return visionModel when images detected)
- [X] T024 [US2] Update routingRunLoop in packages/core/src/agent/loop.ts (pre-route images, skip route detection for vision_model start)
- [X] T025 [US2] Update Agent.run in packages/core/src/agent/agent.ts (detect images, pass to routingRunLoop)

**Checkpoint**: User Story 2 functional - image routing works independently

---

## Phase 5: User Story 3 - Tool Call Model Switching (Priority: P2)

**Goal**: Tool results return to calling model, route tokens in results trigger switches

**Independent Test**: Trigger tool calls from reasoning_model, verify results return to calling model

### Tests for User Story 3

- [X] T026 [P] [US3] Write tool execution context tests in packages/core/src/agent/loop.test.ts (callingModel tracking, result return)

### Implementation for User Story 3

- [X] T027 [US3] Add callingModel tracking in packages/core/src/agent/loop.ts (store model identity before tool call)
- [X] T028 [US3] Update tool result handling in packages/core/src/agent/loop.ts (return results to callingModel)
- [X] T029 [US3] Add route token check on tool results in packages/core/src/agent/loop.ts (checkLineStart on tool output)

**Checkpoint**: User Story 3 functional - tool execution coordination works

---

## Phase 6: User Story 4 - Configuration and Fallback (Priority: P2)

**Goal**: Unset models fallback to default_model, config priority (env > TOML > default)

**Independent Test**: Set various config combinations, verify fallback behavior

### Tests for User Story 4

- [X] T030 [P] [US4] Write config fallback tests in packages/core/src/config.test.ts (unset models fallback, env var priority)

### Implementation for User Story 4

- [X] T031 [US4] Add fallback logic tests coverage in packages/core/src/config.test.ts (SC-004, SC-008, SC-009 scenarios)

**Checkpoint**: User Story 4 functional - config system fully tested

---

## Phase 7: User Story 5 - Tool Result Route Token Detection (Priority: P3)

**Goal**: Route tokens in tool results trigger model switches (line start detection)

**Independent Test**: Tool returns content starting with [REASONING], verify model switch

### Tests for User Story 5

- [X] T032 [P] [US5] Write tool result routing tests in packages/core/src/agent/loop.test.ts (route token in tool result triggers switch)

### Implementation for User Story 5

- [X] T033 [US5] Enhance tool result route detection in packages/core/src/agent/loop.ts (increment routeCount on tool result token)

**Checkpoint**: User Story 5 functional - full routing lifecycle works

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Integration, cleanup, documentation

- [X] T034 Run biome check on all modified files: `bunx biome check --error-on-warnings packages/core/src/agent/ packages/core/src/config.ts`
- [X] T035 Run type check: `bunx tsc --noEmit -p tsconfig.check.json`
- [X] T036 Run all tests: `bun test packages/core/src/agent/ packages/core/src/config.test.ts`
- [X] T037 [P] Update constitution.md to reflect CHLOE_DEFAULT_MODEL env var (from CHLOE_MODEL)
- [ ] T038 Validate quickstart.md scenarios manually

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - start immediately
- **Foundational (Phase 2)**: Depends on Setup - BLOCKS all user stories
- **User Stories (Phase 3-7)**: All depend on Foundational completion
  - US1 and US2 are both P1, can proceed in parallel
  - US3 and US4 are both P2, can proceed after US1/US2
  - US5 is P3, proceeds after US3
- **Polish (Phase 8)**: Depends on all user stories

### User Story Dependencies

- **US1 (P1)**: Depends on Phase 2 only - independent
- **US2 (P1)**: Depends on Phase 2 only - independent (parallel with US1)
- **US3 (P2)**: Depends on US1 routing infrastructure
- **US4 (P2)**: Depends on Phase 2 only - independent
- **US5 (P3)**: Depends on US3 tool execution logic

### Within Each User Story

- Tests written before implementation
- Core modules before integration
- Checkpoint validation before next phase

### Parallel Opportunities

- T002, T003 can run in parallel (different files)
- T012, T013 can run in parallel (different test files)
- T014, T015 can run in parallel (different implementation files)
- T020, T021 can run in parallel (test + implementation)
- US1 and US2 phases can run in parallel (different concerns)
- T030, T031 can run in parallel (different test scenarios)
- T032, T033 can run in parallel (test + implementation)
- T034, T037 can run in parallel (different files)

---

## Parallel Example: Phase 3 (User Story 1)

```bash
# Launch tests together:
Task: "Write RouteDetector unit tests in packages/core/src/agent/route-detector.test.ts"
Task: "Write ModelRouter unit tests in packages/core/src/agent/router.test.ts"

# Launch implementations together:
Task: "Implement RouteDetector in packages/core/src/agent/route-detector.ts"
Task: "Implement ModelRouter basic methods in packages/core/src/agent/router.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (BLOCKS all stories)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: Test text routing independently
5. Deploy/demo if ready

### Incremental Delivery

1. Setup + Foundational → Config ready
2. Add US1 → Test independently → MVP (text routing)
3. Add US2 → Test independently → Image routing added
4. Add US3 + US4 → Test independently → Tool/config complete
5. Add US5 → Test independently → Full routing lifecycle
6. Polish → Production ready

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together
2. Once Foundational done:
   - Developer A: User Story 1 (text routing)
   - Developer B: User Story 2 (image routing) - parallel!
3. After US1/US2:
   - Developer A: User Story 3 (tool switching)
   - Developer B: User Story 4 (config fallback) - parallel!
4. After US3: User Story 5 (tool result routing)

---

## Notes

- All tasks follow checklist format: checkbox + ID + optional [P] + optional [Story] + file path
- Tests included per constitution requirement for unit tests of important logic
- Config changes (Phase 2) are foundational - must complete before any user story
- US1 and US2 are independent and can proceed in parallel
- Each checkpoint validates story independently before proceeding
- Biome and TypeScript checks must pass before commit