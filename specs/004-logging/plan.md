# Implementation Plan: Structured File Logging

**Branch**: `004-logging` | **Date**: 2026-04-14 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/004-logging/spec.md`

## Summary

Add a structured file-logging module to `packages/core`. A `Logger` interface with `debug/info/warn/error` methods is backed by a `LogSink` abstraction, making future sinks (Prometheus, HTTP) drop-in additions. The initial `FileSink` writes rotating plain-text log lines to `./logs/chloe-YYYY-MM-DD.log`, rotates on size, and prunes files older than a configurable number of days. A global singleton (`initLogger` / `getLogger`) lets all packages share one logger with zero coupling.

## Technical Context

**Language/Version**: TypeScript 5.x, `strict: true`, `exactOptionalPropertyTypes: true`, `noUncheckedIndexedAccess: true`
**Runtime**: Bun ≥ 1.1 (no Node.js shims; use `node:fs` built-ins available in Bun)
**Primary Dependencies**: `node:fs` (appendFileSync, statSync, readdirSync, renameSync, unlinkSync, mkdirSync), `node:path`, `node:process` — **no new npm packages**
**Storage**: File I/O only
**Testing**: `bun test`
**Target Platform**: Linux (WSL2 primary), macOS compatible
**Project Type**: Library module within Bun monorepo workspace
**Performance Goals**: Synchronous write overhead is acceptable for a personal assistant (low-frequency log calls); no throughput requirement
**Constraints**: Must pass `biome check --error-on-warnings`; no `any`; no new dependencies

## Constitution Check

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Core-Library-First | ✅ PASS | Logger lives entirely in `packages/core`; entry points (`api`, `cli`) call `initLogger` — no logic in entry points |
| II. Strict TypeScript | ✅ PASS | `LogLevel` union type; no `any`; interfaces for `Logger` and `LogSink`; all fields typed |
| III. Biome | ✅ PASS | No special concerns; formatter.ts and file-sink.ts are pure functions, easy to lint |
| IV. DRY | ✅ PASS | Single formatter, single singleton — no duplication across packages |
| V. Plugin Contracts | ✅ PASS | `LogSink` interface is the extension point; `FileSink` is the reference implementation |
| VI. Streaming Always | N/A | Not a Claude interaction feature |
| VII. Unit Tests | ✅ PLAN | `formatter.ts` and level-filtering logic tested; rotation trigger logic tested with a mock fs |
| VIII. Human-in-the-Loop | N/A | No tool execution involved |

**No violations. Gate passed.**

## Project Structure

### Documentation (this feature)

```text
specs/004-logging/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
└── tasks.md             # Phase 2 output
```

### Source Code

```text
packages/core/src/logger/
├── types.ts             # LogLevel, Logger, LogSink interfaces
├── formatter.ts         # formatLine() pure function
├── file-sink.ts         # FileSink: rotation + pruning
├── logger.ts            # CoreLogger + global initLogger/getLogger
└── index.ts             # Public re-exports

packages/core/src/config.ts       # Add LoggingConfig + update loadConfig()
packages/core/src/index.ts        # Re-export Logger, LogSink, initLogger, getLogger

packages/core/tests/logger/
├── formatter.test.ts
├── file-sink.test.ts
└── logger.test.ts

packages/api/src/index.ts         # Add initLogger(cfg.logging) call
packages/cli/src/index.ts         # Add initLogger(cfg.logging) call

# Instrumented files (add getLogger() calls):
packages/core/src/agent/agent.ts
packages/core/src/agent/loop.ts
packages/api/src/handlers/messages.ts
packages/api/src/handlers/sessions.ts
packages/core/src/storage/sqlite.ts
packages/core/src/config.ts
```

**Structure Decision**: Monorepo workspace; logger is a sub-module of `packages/core` following the existing `agent/`, `session/`, `storage/`, `tools/` pattern.

## Complexity Tracking

No constitution violations — table not required.
