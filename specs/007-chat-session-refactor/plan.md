# Implementation Plan: Chat Session Command Refactor

**Branch**: `007-chat-session-refactor` | **Date**: 2026-04-15 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/007-chat-session-refactor/spec.md`

## Summary

Refactor the `chloe chat` command to support three modes:
1. Default (`chat`) - create new session with auto-generated time-sorted ID
2. `--continue` - resume most recently active session
3. `--session <id>` - resume specific session by ID

The implementation adds a `getLastSession()` method to the storage adapter and a session ID generator utility, with CLI argument parsing updates.

## Technical Context

**Language/Version**: TypeScript 5.x (strict mode)
**Primary Dependencies**: Bun ≥ 1.1, `@anthropic-ai/sdk`, `bun:sqlite`
**Storage**: SQLite via `bun:sqlite` (existing)
**Testing**: `bun test`
**Target Platform**: Linux/macOS/WSL terminal
**Project Type**: CLI application (monorepo: packages/core, packages/cli, packages/api)
**Performance Goals**: Session creation < 100ms, error display < 50ms
**Constraints**: No breaking changes to existing sessions
**Scale/Scope**: Single-user CLI tool

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Check | Status |
|-----------|-------|--------|
| I. Core-Library-First | `getLastSession()` and ID generator in `@chloe/core` | ✅ |
| II. Strict TypeScript | No `any`, strict mode | ✅ |
| III. Biome | Will run `biome check` before commit | ✅ |
| IV. DRY | Single ID generator function, single storage method | ✅ |
| V. Plugin Contracts | Extends `StorageAdapter` interface | ✅ |
| VI. Streaming Always | N/A - not touching streaming logic | ✅ |
| VII. Unit Tests | Tests for ID generator and `getLastSession()` | ✅ |
| VIII. Human-in-the-Loop | `--yes` flag preserved | ✅ |

**Gate Status**: ✅ PASS - No violations

## Project Structure

### Documentation (this feature)

```text
specs/007-chat-session-refactor/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   └── cli-session-command.md
└── tasks.md             # Phase 2 output
```

### Source Code (repository root)

```text
packages/
├── core/
│   └── src/
│       ├── session/
│       │   ├── id.ts              # NEW: time-sorted ID generator
│       │   ├── id.test.ts         # NEW: unit tests for ID generator
│       │   ├── name.ts            # NEW: timestamp name formatter
│       │   └── types.ts           # Existing: Session types
│       │   └── slug.ts            # Existing: slugify (unused for new sessions)
│       └── storage/
│           ├── adapter.ts         # MODIFY: add getLastSession() to interface
│           └── sqlite.ts          # MODIFY: implement getLastSession()
│           └── sqlite.test.ts     # MODIFY: add tests for getLastSession()
└── cli/
    └── src/
        ├── index.ts               # MODIFY: update argument parsing
        └── commands/
            └── chat.ts            # MODIFY: handle new options
```

**Structure Decision**: Existing monorepo structure. New session utilities in `packages/core/src/session/`, storage extension in `packages/core/src/storage/`, CLI updates in `packages/cli/src/`.

## Complexity Tracking

No violations to justify - implementation follows existing patterns.