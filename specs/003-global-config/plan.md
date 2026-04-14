# Implementation Plan: Global Config via ~/.chloe/settings/config.toml

**Branch**: `003-global-config` | **Date**: 2026-04-14 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/003-global-config/spec.md`

## Summary

Add `~/.chloe/settings/config.toml` as a persistent configuration store, replacing the requirement to set `CHLOE_*` env vars on every shell session. Env vars still override file values. A `chloe config` CLI subcommand allows init/show/get/set operations. The existing `~/.chloe/chloe.db` is automatically migrated to `~/.chloe/sessions/chloe.db` on first startup. Config loading is centralised in `packages/core` per the Core-Library-First principle.

## Technical Context

**Language/Version**: TypeScript 5.x  
**Primary Dependencies**: `smol-toml` (TOML parse/stringify), `node:readline` (interactive prompts, already used in `chat.ts`), `node:fs` (chmod), `node:os` + `node:path` (existing)  
**Storage**: TOML file at `~/.chloe/settings/config.toml`; SQLite at `~/.chloe/sessions/chloe.db`  
**Testing**: `bun test`  
**Target Platform**: Linux/macOS, Bun ≥ 1.1  
**Project Type**: CLI + REST API (Bun workspace monorepo — `packages/core`, `packages/cli`, `packages/api`)  
**Performance Goals**: Config load is synchronous at startup — must complete in <50ms (file read + TOML parse)  
**Constraints**: `strict: true`, `exactOptionalPropertyTypes: true`, `noUncheckedIndexedAccess: true`; Biome-clean; no `any`  
**Scale/Scope**: Single-user personal assistant

## Constitution Check

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Core-Library-First | ✓ PASS | `loadConfig()` and `migrateDb()` in `packages/core/src/config.ts`; CLI/API are thin callers |
| II. Strict TypeScript | ✓ PASS | `ChloeConfig` typed interface, no `any`, snake_case→camelCase mapping explicit |
| III. Biome | ✓ PASS | All new files must pass `biome check --error-on-warnings` |
| IV. DRY | ✓ PASS | Single `loadConfig()` replaces 4 scattered `process.env.CHLOE_*` reads |
| V. Plugin Contracts | ✓ PASS | `ChloeConfig` is the interface; file and env var are two implementations of the same contract |
| VI. Streaming | N/A | Config is not a streaming concern |
| VII. Unit Tests | ✓ PASS | `loadConfig()` merge logic, migration edge cases, `maskSecret()` are critical paths requiring tests |
| VIII. Human-in-the-Loop | N/A | Config commands are not agent tool calls |

## Project Structure

### Documentation (this feature)

```text
specs/003-global-config/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── cli-config.md    # Phase 1 output
└── tasks.md             # Phase 2 output (speckit-tasks)
```

### Source Code

```text
packages/
├── core/
│   └── src/
│       ├── config.ts           # NEW: loadConfig(), ChloeConfig, migrateDb(), maskSecret()
│       └── index.ts            # MODIFIED: export config symbols
├── cli/
│   └── src/
│       ├── index.ts            # MODIFIED: add 'config' subcommand; move api_key guard
│       └── commands/
│           ├── chat.ts         # MODIFIED: use loadConfig() instead of process.env
│           ├── sessions.ts     # MODIFIED: use loadConfig() instead of process.env
│           └── config.ts       # NEW: init, show, get, set subcommands
└── api/
    └── src/
        └── index.ts            # MODIFIED: use loadConfig() instead of process.env

tests/
└── unit/
    └── config.test.ts          # NEW: loadConfig merge, migration, maskSecret
```

## Complexity Tracking

No constitution violations found.
