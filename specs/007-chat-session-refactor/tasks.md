# Tasks: Chat Session Command Refactor

**Feature**: 007-chat-session-refactor
**Date**: 2026-04-15
**Spec**: [spec.md](./spec.md)
**Plan**: [plan.md](./plan.md)

## Task Breakdown

### Phase 1: Core Library Changes

#### Task 1: Add Session ID Generator
**Priority**: P1 | **Estimate**: 30min | **Owner**: completed ✅

**Description**: Create `generateSessionId()` function that produces time-sorted IDs.

**Files**:
- `packages/core/src/session/id.ts` (NEW)
- `packages/core/src/session/id.test.ts` (NEW)

**Acceptance Criteria**:
- ID format: `YYYYMMDDHHmmss-xxxxxxx` (22 chars)
- Uses `Date` for timestamp, `crypto.randomUUID()` for random suffix
- Unit tests cover: format validation, uniqueness (multiple calls), edge cases

---

#### Task 2: Add Session Name Formatter
**Priority**: P1 | **Estimate**: 15min | **Owner**: completed ✅

**Description**: Create `formatSessionName()` function for timestamp-formatted names.

**Files**:
- `packages/core/src/session/name.ts` (NEW)

**Acceptance Criteria**:
- Name format: `"YYYY-MM-DD HH:mm"` (16 chars)
- Zero-padded month, day, hours, minutes
- Exported from `@chloe/core`

---

#### Task 3: Extend StorageAdapter Interface
**Priority**: P1 | **Estimate**: 15min | **Owner**: completed ✅

**Description**: Add `getLastSession()` method to `StorageAdapter` interface.

**Files**:
- `packages/core/src/storage/adapter.ts` (MODIFY)

**Acceptance Criteria**:
- Interface method: `getLastSession(): Promise<Session | null>`
- Returns session with highest `updatedAt`, or `null` if empty

---

#### Task 4: Implement getLastSession in SQLiteStorageAdapter
**Priority**: P1 | **Estimate**: 20min | **Owner**: completed ✅

**Description**: Implement `getLastSession()` in SQLite storage.

**Files**:
- `packages/core/src/storage/sqlite.ts` (MODIFY)
- `packages/core/src/storage/sqlite.test.ts` (MODIFY)

**Acceptance Criteria**:
- Query: `SELECT ... ORDER BY updated_at DESC LIMIT 1`
- Returns `null` when no sessions exist
- Unit tests cover: returns latest, returns null when empty, multiple sessions

---

### Phase 2: CLI Changes

#### Task 5: Update CLI Argument Parser
**Priority**: P1 | **Estimate**: 30min | **Owner**: completed ✅

**Description**: Update argument parsing in `index.ts` for new flags.

**Files**:
- `packages/cli/src/index.ts` (MODIFY)

**Acceptance Criteria**:
- Parse `--continue` flag
- Parse `--session <id>` with value
- Validate mutual exclusivity (`--continue` + `--session` → error)
- Preserve `--yes`/`-y` behavior
- Default (no flags) → create new session

---

#### Task 6: Update chatCommand for New Options
**Priority**: P1 | **Estimate**: 45min | **Owner**: completed ✅

**Description**: Modify `chatCommand()` to handle three session modes.

**Files**:
- `packages/cli/src/commands/chat.ts` (MODIFY)

**Acceptance Criteria**:
- Default mode: generate ID + name, create session
- `--continue`: call `getLastSession()`, error if null
- `--session <id>`: call `getSession(id)`, error if null
- Pass correct session ID to UI component
- Error messages match spec exactly

---

### Phase 3: Testing & Quality

#### Task 7: Update Core Tests
**Priority**: P1 | **Estimate**: 20min | **Owner**: completed ✅

**Description**: Ensure all new functions have unit tests.

**Files**:
- `packages/core/src/session/id.test.ts` (NEW)
- `packages/core/src/storage/sqlite.test.ts` (MODIFY)

**Acceptance Criteria**:
- Test `generateSessionId()` format and uniqueness
- Test `getLastSession()` query behavior
- All tests pass: `bun test`

---

#### Task 8: Run Quality Checks
**Priority**: P1 | **Estimate**: 10min | **Owner**: completed ✅

**Description**: Run Biome and TypeScript checks.

**Commands**:
```bash
bunx biome check --error-on-warnings .
bunx tsc --noEmit -p tsconfig.check.json
bun test
```

**Acceptance Criteria**:
- No Biome errors or warnings
- No TypeScript errors
- All tests pass

---

## Task Dependencies

```
Task 1 ─┬─► Task 6
        │
Task 2 ─┤
        │
Task 3 ─┼─► Task 4 ─► Task 7 ─► Task 8
        │
Task 5 ─┴─► Task 6
```

- Tasks 1-5 can run in parallel
- Task 6 depends on Tasks 1, 2, 3, 5
- Task 7 depends on Task 4
- Task 8 depends on Tasks 6, 7

## Coverage Matrix

| Requirement | Task Coverage |
|-------------|---------------|
| FR-001 | Task 1, Task 6 |
| FR-002 | Task 1 |
| FR-003 | Task 2, Task 6 |
| FR-004 | Task 3, Task 4, Task 6 |
| FR-005 | Task 6 |
| FR-006 | Task 5, Task 6 |
| FR-007 | Task 6 |
| FR-008 | Task 5 |
| FR-009 | Task 5 |
| FR-010 | Task 5, Task 6 |
| FR-011 | Task 3 |
| FR-012 | Task 4 |
| FR-013 | Task 5 |
| FR-014 | Task 6 |
| FR-015 | Task 5, Task 6 |

| User Story | Task Coverage |
|------------|---------------|
| US-1 | Task 1, Task 2, Task 6 |
| US-2 | Task 3, Task 4, Task 5, Task 6 |
| US-3 | Task 5, Task 6 |
| US-4 | Task 5, Task 6 |

| Success Criterion | Task Coverage |
|-------------------|---------------|
| SC-001 | Task 6 |
| SC-002 | Task 1, Task 6 |
| SC-003 | Task 3, Task 4, Task 6 |
| SC-004 | Task 6 |
| SC-005 | Task 7 |
| SC-006 | Task 8 |