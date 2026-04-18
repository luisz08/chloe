# Tasks: Skill System

**Spec**: `specs/012-skill-system/spec.md`  
**Plan**: `specs/012-skill-system/plan.md`

---

## Phase 1: Core Skill Infrastructure (Foundational — blocks all stories)

**Purpose**: Types, loader, and router in `packages/core/src/skills/`. No CLI/API changes yet.

- [ ] T001 Create `packages/core/src/skills/types.ts` with `Skill`, `SkillSource`, `CommandResult` types
- [ ] T002 [P] [US1] Write failing tests for `SkillLoader` in `packages/core/src/skills/loader.test.ts`
  - global dir loads skills, project dir loads skills, project overrides global, missing dir silently skipped, invalid filenames ignored, empty file returns error result
- [ ] T003 [US1] Implement `packages/core/src/skills/loader.ts` (`loadSkills`, `expandArguments`) until T002 passes
- [ ] T004 [P] [US2] Write failing tests for `CommandRouter` in `packages/core/src/skills/router.test.ts`
  - passthrough for non-/ input, internal /help, skill expansion with $ARGUMENTS, unknown command error, empty skill error
- [ ] T005 [US2] Implement `packages/core/src/skills/router.ts` (`routeCommand`) until T004 passes
- [ ] T006 Export from `packages/core/src/skills/index.ts` and re-export via `packages/core/src/index.ts`

**Checkpoint**: `bun test packages/core/src/skills/` all pass. Core skill system is independently usable.

---

## Phase 2: User Story 1 — Skill Invocation via CLI (P1)

**Goal**: `/skill-name [args]` in CLI chat loads and expands a skill, sends expanded content to AI.

**Independent Test**: Create `~/.chloe/skills/greet.md` with `Say hello to $ARGUMENTS`, run `chloe chat`, type `/greet world` → AI receives "Say hello to world".

- [ ] T007 [US1] Wire `routeCommand` into `packages/cli/src/ui/App.tsx` `handleSubmit`:
  - Before `agent.run()`: call `routeCommand(text, opts)`
  - `passthrough` → proceed unchanged
  - `skill` → call `agent.run()` with `expandedContent`
  - `internal` → display output as system message, skip `agent.run()`
  - `error` → display error message, skip `agent.run()`
- [ ] T008 [US1] Pass `globalSkillsDir` and `projectSkillsDir` into `App` via props (resolved in `packages/cli/src/commands/chat.ts`)

**Checkpoint**: Manual test — `/greet world` expands and AI receives the skill content.

---

## Phase 3: User Story 2 — /help Internal Command (P2)

**Goal**: `/help` lists all internal commands and available skills with their source.

**Independent Test**: Create one global and one project skill, type `/help` → both listed with source labels.

- [ ] T009 [US2] Implement `/help` handler in `packages/core/src/skills/router.ts`:
  - Lists internal commands
  - Lists global skills (annotated `global`)
  - Lists project skills (annotated `project`, with `[overrides global]` note when applicable)
  - Shows "No skills defined." when both dirs are empty or missing
- [ ] T010 [US2] Add tests to `router.test.ts` for `/help` output format (empty dirs, one dir, both dirs, override case)

**Checkpoint**: `/help` output correct for all cases.

---

## Phase 4: User Story 3 — Unknown Command Error (P3)

**Goal**: `/nonexistent` returns "Unknown command: /nonexistent", no AI call.

**Independent Test**: Type `/nonexistent` → error displayed, no AI request made.

- [ ] T011 [US3] Verify `router.ts` already returns `{ kind: "error" }` for unknown commands (covered by T004/T005)
- [ ] T012 [US3] Verify CLI `App.tsx` displays error messages without calling `agent.run()` (covered by T007)
- [ ] T013 [US3] Add explicit test case in `router.test.ts` for empty skill file error message format

**Checkpoint**: Unknown command and empty skill both produce errors with no AI call.

---

## Phase 5: User Story 4 — API Layer Support (P4)

**Goal**: HTTP API handles `/skill-name args` identically to CLI.

**Independent Test**: `POST /sessions/:id/messages` with `{ "content": "/greet world" }` → AI receives expanded content.

- [ ] T014 [US4] Wire `routeCommand` into `packages/api/src/handlers/messages.ts` `handlePostMessage`:
  - `passthrough` → proceed unchanged
  - `skill` → call `agent.run()` with `expandedContent`
  - `internal` → return `200 text/plain` with output
  - `error` → return `400 application/json` with `{ error: message }`
- [ ] T015 [P] [US4] Resolve skill dirs in API: global via `os.homedir()`, project via `process.cwd()`

**Checkpoint**: API `/greet world` → AI receives expanded content; `/nonexistent` → 400 error.

---

## Phase 6: Polish & Cross-Cutting

- [ ] T016 [P] Run `bunx biome check --error-on-warnings .` and fix all issues
- [ ] T017 [P] Run `bunx tsc --noEmit -p tsconfig.check.json` and fix all type errors
- [ ] T018 Run `bun test` — all existing + new tests pass
- [ ] T019 [P] Run `bun run --filter '*' build` — all packages build clean

---

## Dependencies & Execution Order

- **Phase 1** (T001–T006): No dependencies — start immediately. Blocks all other phases.
- **Phase 2** (T007–T008): Depends on Phase 1.
- **Phase 3** (T009–T010): Depends on Phase 1. Can run in parallel with Phase 2.
- **Phase 4** (T011–T013): Depends on Phase 1. Mostly verification of existing work.
- **Phase 5** (T014–T015): Depends on Phase 1. Can run in parallel with Phases 2–4.
- **Phase 6** (T016–T019): Depends on all previous phases.

### Parallel opportunities
- T002 and T004 (tests) can be written in parallel before any implementation.
- Phases 2, 3, 4, 5 can all start once Phase 1 is complete.
