# Reviewers Guide: Chat Session Command Refactor

**Feature**: 007-chat-session-refactor
**Branch**: `007-chat-session-refactor`
**Review Date**: 2026-04-15

## Review Checklist

### Spec Review ✅ Completed

- [x] Soundness: Structure complete, requirements consistent
- [x] Completeness: All user scenarios, edge cases, error handling documented
- [x] Implementability: Low complexity, no new dependencies

### Plan Review ✅ Completed

- [x] Coverage Matrix: 100% FR coverage, 100% US coverage, 100% SC coverage
- [x] Task Quality: All tasks have files, AC, estimates
- [x] Red Flag Scan: No issues found
- [x] NFR Validation: Performance, quality, testing covered

---

## Key Review Points

### Architecture Changes

| Component | Change | Review Focus |
|-----------|--------|--------------|
| `StorageAdapter` | Add `getLastSession()` method | Interface signature correct |
| `SQLiteStorageAdapter` | Implement query | SQL correctness, null handling |
| `session/id.ts` | New ID generator | Format validation, uniqueness |
| `session/name.ts` | New name formatter | Format correctness |
| `CLI index.ts` | Argument parsing | Flag handling, error paths |
| `chat.ts` | Command logic | Three modes, error messages |

### Critical Acceptance Criteria

1. **FR-001**: Time-sorted ID format `YYYYMMDDHHmmss-xxxxxxx` must be validated in tests
2. **FR-005**: Error message exact: `"No previous session found. Use 'chloe chat' to start a new session."`
3. **FR-007**: Error message exact: `"Session '<id>' not found. Use 'chloe chat' to start a new session."`
4. **FR-008**: Error message exact: `"Error: cannot use both --continue and --session"`
5. **SC-005**: All existing tests must pass (no regression)

### Potential Risk Areas

| Risk | Mitigation | Reviewer Attention |
|------|------------|-------------------|
| ID collision | Random suffix from UUID | Test uniqueness with multiple rapid calls |
| Existing sessions | No transformation on lookup | Test with legacy slug-style IDs |
| Empty database | `getLastSession()` returns null | Test null handling in CLI |
| Concurrent updates | SQLite handles via WAL | Not a concern for single-user CLI |

---

## Test Verification

### Must-Have Tests

| Test File | Test Cases |
|-----------|------------|
| `id.test.ts` | Format matches `YYYYMMDDHHmmss-xxxxxxx`, uniqueness across 100 calls |
| `sqlite.test.ts` | `getLastSession()` returns latest, returns null when empty, handles multiple sessions |
| CLI integration | `--continue` error when empty, `--session <id>` error when not found, mutual exclusivity error |

### Manual Testing

```bash
# Test new session creation
chloe chat
# Verify: ID format correct, name is timestamp

# Test continue
chloe chat --continue
# Verify: Loads last session

# Test continue with no sessions (use fresh DB)
# Verify: Error message appears

# Test specific session
chloe sessions list
chloe chat --session <id_from_list>
# Verify: Correct session loads

# Test error cases
chloe chat --continue --session foo
# Verify: Mutual exclusivity error

chloe chat --session nonexistent
# Verify: Not found error
```

---

## Review Sign-off

| Reviewer | Role | Status | Comments |
|----------|------|--------|----------|
| _pending_ | Architecture | ⏳ Pending | |
| _pending_ | Implementation | ⏳ Pending | |
| _pending_ | Testing | ⏳ Pending | |

---

## Artifacts

| Artifact | Path | Status |
|----------|------|--------|
| Specification | `specs/007-chat-session-refactor/spec.md` | ✅ Complete |
| Implementation Plan | `specs/007-chat-session-refactor/plan.md` | ✅ Complete |
| Research | `specs/007-chat-session-refactor/research.md` | ✅ Complete |
| Data Model | `specs/007-chat-session-refactor/data-model.md` | ✅ Complete |
| Contracts | `specs/007-chat-session-refactor/contracts/cli-session-command.md` | ✅ Complete |
| Quickstart | `specs/007-chat-session-refactor/quickstart.md` | ✅ Complete |
| Tasks | `specs/007-chat-session-refactor/tasks.md` | ✅ Complete |
| Reviewers Guide | `specs/007-chat-session-refactor/REVIEWERS.md` | ✅ Complete |