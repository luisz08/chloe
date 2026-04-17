# Tasks: Single-Model Routing Fix & Refactor Residue Cleanup

**Input**: Design documents from `/specs/010-single-model-routing-fix/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/agent-api.md, quickstart.md

**Tests**: Tests are REQUIRED by the feature spec (FR-007, FR-013, FR-014, SC-007). Test tasks are included below.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Maps task to a user story for traceability (US1, US2, US3, US4)
- Include exact file paths in descriptions

## Path Conventions

- Bun workspace monorepo. All source under `packages/core/src/`.
- Tests co-located with source as `*.test.ts`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Verify baseline so regressions caused by this feature are attributable.

- [ ] T001 Capture baseline: run `bun test`, `bunx tsc --noEmit -p tsconfig.check.json`, and `bunx biome check --error-on-warnings .` from repo root — confirm all three pass before any code changes

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Structural refactors that US1–US3 all depend on. Must complete before any user-story phase begins.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [ ] T002 Add `isMultiModel(config: ResolvedModelConfig): boolean` helper to `packages/core/src/agent/router.ts` — returns true iff any of `reasoningModel`, `fastModel`, `visionModel` differs from `defaultModel`; export from the module
- [ ] T003 [P] Move the `SUBAGENT_SYSTEM_PROMPT` constant from `packages/core/src/agent/loop.ts` to `packages/core/src/agent/agent.ts` (or a sibling `agent/prompts.ts` imported by `agent.ts`). `loop.ts` must no longer reference the constant
- [ ] T004 Merge `runLoop` and `routingRunLoop` in `packages/core/src/agent/loop.ts` into a single `runLoop`:
    - Add optional `system?: string` to `RunLoopOptions`; pass it through to `client.messages.stream({ system, ... })` only when defined
    - Remove `routingRunLoop` export
    - Remove `RoutingRunLoopOptions` type
    - Remove unused `modelConfig` and `hasImages` parameters from the options type
    - Replace every internal read of `routingState.currentModel` with the `model` options field; delete the `RoutingState` local variable
- [ ] T005 Update `packages/core/src/agent/loop.test.ts` to exercise the merged `runLoop` — preserve all existing test scenarios (≥6), fix any broken imports/type references from the removed `RoutingRunLoopOptions`, and ensure the suite compiles and passes. Test-comment sweep for "route token" is deferred to US4 (T022)
- [ ] T006 Update the single internal caller of the loop in `packages/core/src/agent/agent.ts` so it calls the merged `runLoop` (pass-through call only; conditional `system` injection arrives in US1). Verify `bun test packages/core/src/agent/loop.test.ts` passes and `bunx tsc --noEmit -p tsconfig.check.json` is clean

**Checkpoint**: One loop, one options type, `isMultiModel` available, `SUBAGENT_SYSTEM_PROMPT` owned by `agent.ts`. User-story phases can now begin.

---

## Phase 3: User Story 1 - Single-model configuration behaves as single-model (Priority: P1) 🎯 MVP

**Goal**: When the effective `ResolvedModelConfig` has every specialized model equal to `defaultModel`, the agent registers no subagent tools and sends no subagent system-prompt text to the model.

**Independent Test**: Construct `new Agent({ model, apiKey, storage, modelConfig })` where `modelConfig` has only `defaultModel` populated (others fall back). Assert (a) `vision_analyze` / `fast_query` / `deep_reasoning` are absent from the tool registry, and (b) a mocked `client.messages.stream` call made by `agent.run(...)` receives no `system` parameter.

### Tests for User Story 1 (write FIRST, confirm FAIL before implementation) ⚠️

- [ ] T007 [US1] Create `packages/core/src/agent/agent.test.ts` with a test case "single-model config omits subagent tools": build an `Agent` with a single-model `ResolvedModelConfig`, assert `agent` internals expose a tool registry whose `list()` contains none of `vision_analyze`, `fast_query`, `deep_reasoning` (FR-002, FR-013-a). If no test-only accessor exists, add one or inject a mock `Anthropic` client and inspect `stream` params
- [ ] T008 [P] [US1] Add test case "single-model config omits subagent system prompt" to `packages/core/src/agent/agent.test.ts`: invoke `agent.run(sessionId, message)` against a mocked Anthropic client, assert the captured `messages.stream` params do NOT contain a `system` field (FR-004, FR-013-b)

### Implementation for User Story 1

- [ ] T009 [US1] Modify the `Agent` constructor in `packages/core/src/agent/agent.ts`:
    - After resolving `modelConfig`, compute `const multiModel = isMultiModel(this.modelConfig)`
    - In the `config.tools === undefined` branch, call `createSubagentTools(...)` ONLY when `multiModel === true`
    - Store a private field `subagentPromptActive: boolean` set to `multiModel && config.tools === undefined`
- [ ] T010 [US1] Modify `Agent.run(...)` in `packages/core/src/agent/agent.ts` to pass `{ system: SUBAGENT_SYSTEM_PROMPT }` into `runLoop` iff `this.subagentPromptActive === true` (spread only when true, matching contracts/agent-api.md §1)
- [ ] T011 [US1] Re-run the US1 tests from T007/T008 and confirm they pass. Re-run `bunx tsc --noEmit -p tsconfig.check.json` and `bunx biome check --error-on-warnings .` — both clean

**Checkpoint**: Single-model mode is now fully functional. MVP can ship from here.

---

## Phase 4: User Story 2 - Multi-model configuration still delegates as before (Priority: P2)

**Goal**: No regression to spec 009 multi-model behavior. Confirm all three subagent tools register and the subagent system prompt is attached when at least one specialized model differs from `defaultModel`.

**Independent Test**: Construct `new Agent(...)` with a multi-model `ResolvedModelConfig` (e.g., `fastModel !== defaultModel`). Assert (a) all three subagent tools are present in the registry, and (b) `agent.run(...)` passes the subagent system prompt to `client.messages.stream`.

### Tests for User Story 2 (write FIRST, confirm FAIL if US1 regressed multi-model) ⚠️

- [ ] T012 [US2] Add test case "multi-model config registers all subagent tools" to `packages/core/src/agent/agent.test.ts`: construct `Agent` with a multi-model `ResolvedModelConfig`, assert the registry contains `vision_analyze`, `fast_query`, `deep_reasoning` (FR-001, FR-014-a)
- [ ] T013 [P] [US2] Add test case "multi-model config attaches subagent system prompt" to `packages/core/src/agent/agent.test.ts`: invoke `agent.run(...)` against a mocked Anthropic client, assert the captured `messages.stream` params contain `system: SUBAGENT_SYSTEM_PROMPT` (FR-006, FR-014-b)

### Implementation for User Story 2

- [ ] T014 [US2] No production code change expected — US1's conditional registration naturally preserves the multi-model path. Run T012/T013 and confirm they pass. If they fail, investigate and fix in `packages/core/src/agent/agent.ts` (likely mis-inverted `multiModel` condition)

**Checkpoint**: Multi-model mode verified intact.

---

## Phase 5: User Story 3 - Callers that inject custom tools control their own prompt surface (Priority: P2)

**Goal**: When the caller supplies `config.tools`, the agent uses exactly those tools AND sends no subagent system prompt.

**Independent Test**: Construct `new Agent({ ..., tools: [customTool] })`. Assert (a) registry contains only `customTool`, and (b) `agent.run(...)` passes no `system` field to `client.messages.stream`.

### Tests for User Story 3 (write FIRST, confirm FAIL before implementation) ⚠️

- [ ] T015 [US3] Add test case "caller-supplied tools disable subagent prompt" to `packages/core/src/agent/agent.test.ts`: construct `Agent` with `config.tools: [customTool]` AND a multi-model `ResolvedModelConfig` (to prove the prompt gating follows `tools`, not just `multiModel`), assert (a) registry contains only `customTool`, and (b) `agent.run(...)` passes no `system` field (FR-005)

### Implementation for User Story 3

- [ ] T016 [US3] Confirm the `Agent` constructor change from T009 already sets `subagentPromptActive = false` in the `config.tools !== undefined` branch (per contracts/agent-api.md §1). Adjust if the flag is currently computed only from `multiModel`. File: `packages/core/src/agent/agent.ts`
- [ ] T017 [US3] Run T015 and confirm it passes

**Checkpoint**: Caller-supplied-tools path does not inject subagent prompt text.

---

## Phase 6: User Story 4 - Developer reading the codebase sees no refactor residue (Priority: P3)

**Goal**: Remove dead types, sweep stale test comments, mark spec 009 as superseded, add explanatory comment for retained defensive code.

**Independent Test**: Walk the diff; run the grep checks from `quickstart.md` (§2, §3, §6) — all must return zero matches.

### Implementation for User Story 4

- [ ] T018 [P] [US4] Remove the `ToolCallContext` interface declaration from `packages/core/src/agent/types.ts` (FR-008). Verify `rg -n 'ToolCallContext' packages/` returns zero matches
- [ ] T019 [P] [US4] Remove the `RoutingState` interface declaration from `packages/core/src/agent/types.ts` (FR-008). Already unused after T004. Verify `rg -n 'RoutingState' packages/` returns zero matches
- [ ] T020 [P] [US4] Sweep `packages/core/src/agent/loop.test.ts` for any comments or test descriptions that reference "route token", "detectRouteToken", or "RouteTokenType"; rewrite them to describe the behavior each test actually asserts (FR-011, SC-006)
- [ ] T021 [P] [US4] Add a short inline comment above the `registry.getCallingTool()` check in each of the three tools in `packages/core/src/tools/subagent.ts` explaining that the check is defensive — it cannot fire in the current design because inner `client.messages.create` calls pass no tools, but it guards against accidental recursion if a future change propagates the registry deeper (per spec Assumptions)
- [ ] T022 [P] [US4] Add a `> **SUPERSEDED BY spec 010**: This document describes the route-token design, which was replaced by subagent tools. See \`specs/010-single-model-routing-fix/\` for the current design.` banner at the top of every document in `specs/009-multi-model-routing/` that describes the route-token design (FR-012, SC-009)

### Verification for User Story 4

- [ ] T023 [US4] Run `rg -n 'ToolCallContext|detectRouteToken|checkLineStart|RouteTokenType|ROUTE_TOKENS|MAX_ROUTE_SWITCHES|routingRunLoop|RoutingState|RoutingRunLoopOptions' packages/` — must return zero matches (SC-004)
- [ ] T024 [US4] Run `rg -in 'route token' packages/core/src/agent/loop.test.ts` — must return zero matches (SC-006)
- [ ] T025 [US4] Run `rg -n 'SUBAGENT_SYSTEM_PROMPT' packages/core/src/agent/` — references must appear only in `agent.ts` (or its sibling prompts module), not in `loop.ts` (per research.md Decision 3)

**Checkpoint**: All four user stories complete. Codebase is coherent.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Final verification against the full quality gate and the developer quickstart.

- [ ] T026 Run the full quality gate from repo root: `bun test`, `bunx tsc --noEmit -p tsconfig.check.json`, and `bunx biome check --error-on-warnings .` — all three must pass with no test-count regression relative to T001 baseline except for net additions (SC-007, SC-008)
- [ ] T027 Walk through `specs/010-single-model-routing-fix/quickstart.md` sections 1–7 and verify each expected outcome. Section 8 (CLI smoke test) is optional if no real API key available
- [ ] T028 [P] Final diff review: inspect staged changes for orphaned imports, unused variables introduced during refactor, or TODOs. Run `bunx biome check` once more to catch anything missed

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately.
- **Phase 2 (Foundational)**: Depends on Phase 1. **BLOCKS all user-story phases.**
- **Phase 3 (US1 — MVP)**: Depends on Phase 2. No dependency on US2/US3/US4.
- **Phase 4 (US2)**: Depends on Phase 3 (tests share `agent.test.ts`; also verifies US1 did not regress multi-model path).
- **Phase 5 (US3)**: Depends on Phase 3 (tests share `agent.test.ts`; verifies caller-supplied-tools gating set up in US1).
- **Phase 6 (US4)**: Depends on Phase 2 (removal of `RoutingState` requires T004 to have severed all reads). Independent of US1/US2/US3 once Phase 2 lands.
- **Phase 7 (Polish)**: Depends on all other phases.

### User Story Dependencies

- US1 (P1 MVP): independent; only needs Foundational.
- US2 (P2): shares test file with US1; naturally sequenced after US1 to co-exist in `agent.test.ts`.
- US3 (P2): shares test file with US1; naturally sequenced after US1 for the same reason.
- US4 (P3): fully independent of US1/US2/US3 once Foundational lands.

### Within Each User Story

- Tests written FIRST, confirm FAIL, then implement to make them pass.
- For this feature, most "implementation" for US2 and US3 is assertion of work done in US1 — the tests are the deliverable; the constructor change already handles them.

### Parallel Opportunities

- T003 can run in parallel with T002 (different files).
- T007 and T008 are in the same file (`agent.test.ts`) — mark one [P] only if the other has landed; otherwise sequence them.
- T018, T019 touch the same file (`types.ts`) — sequence, not parallel. (Marked [P] above because they are independent edits; reconcile by doing both in one edit session if possible.)
- T020, T021, T022 each touch different files and are fully parallel within US4.
- Different developers can take US1, US4 simultaneously once Phase 2 completes.

---

## Parallel Example: User Story 4

```bash
# Once Phase 2 completes, US4 cleanup tasks fan out across files:
Task: "Remove ToolCallContext from packages/core/src/agent/types.ts"
Task: "Sweep route-token comments in packages/core/src/agent/loop.test.ts"
Task: "Add defensive-code comment in packages/core/src/tools/subagent.ts"
Task: "Add SUPERSEDED banner to every doc in specs/009-multi-model-routing/"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001).
2. Complete Phase 2: Foundational (T002–T006) — one loop, one options type, helper + prompt relocated.
3. Complete Phase 3: User Story 1 (T007–T011) — single-model gate in place.
4. **STOP and VALIDATE**: Run T011's quality gate. Single-model mode demonstrably works; multi-model may also work (confirm later in US2).
5. Ship if the primary goal (single-model fix) is the urgent driver.

### Incremental Delivery

1. Foundational → US1 (MVP: single-model fix).
2. Add US2 (P2: regression assertion for multi-model).
3. Add US3 (P2: caller-supplied tools gating).
4. Add US4 (P3: residue cleanup + spec 009 banners).
5. Polish (Phase 7).

### Parallel Team Strategy

With two developers post-Phase 2:

1. Developer A: US1 (T007–T011), then US2 and US3 sequentially (shared test file).
2. Developer B: US4 (T018–T025) — fully independent.
3. Merge, then Developer A (or either) runs Phase 7 polish.

---

## Notes

- [P] tasks touch different files and have no dependency on each other within the current phase.
- Tests for US2 and US3 are the primary deliverable of those phases — the production code was already set up in US1.
- `packages/core/src/agent/agent.test.ts` is a new file; all US1/US2/US3 test tasks append to it.
- Subagent-tool recursion check: retained per spec Assumption; do NOT remove.
- `specs/009-multi-model-routing/` documents receive a banner only — do not rewrite their bodies.
- Commit after each user-story checkpoint so the diff can be reviewed incrementally.
- Do not modify `packages/cli` or `packages/api` — they already pass `modelConfig` correctly.
