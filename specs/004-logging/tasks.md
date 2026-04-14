# Tasks: Structured File Logging

**Branch**: `004-logging` | **Date**: 2026-04-14 | **Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)

---

## Phase 1 — Logger core (packages/core)

### Task 1.1 — Logger types
**File**: `packages/core/src/logger/types.ts`
**What**: Define `LogLevel`, `Logger`, `LogSink` interfaces.
**Acceptance**: Types compile under strict TS; exported cleanly; no `any`.
**Test**: Type-level only — imported by other tasks.

---

### Task 1.2 — Log line formatter
**File**: `packages/core/src/logger/formatter.ts`
**What**: Implement `formatLine(level, component, msg, fields?) → string`. Rules: ISO UTC timestamp, 5-char padded level, `key=value` serialization with space-quoting.
**Acceptance**: Pure function, no I/O. Returns correct format for all log levels and field types.
**Test**: `packages/core/tests/logger/formatter.test.ts` — covers: all levels, empty fields, string values with spaces, numeric/boolean values, input truncation at 200 chars.

---

### Task 1.3 — FileSink
**File**: `packages/core/src/logger/file-sink.ts`
**What**: Implement `FileSink implements LogSink`. On each `write()`: check active file size, rotate if ≥ `maxSizeMb`, then `appendFileSync`. Rotation renames `chloe-YYYY-MM-DD.log` → `chloe-YYYY-MM-DD.N.log` (next free N).
**Acceptance**: Writes a line; rotates correctly when size threshold crossed; multiple rotations produce `.1.log`, `.2.log`, etc.
**Test**: `packages/core/tests/logger/file-sink.test.ts` — uses a temp dir; tests: write creates file, rotation renames at threshold, second rotation uses N=2.

---

### Task 1.4 — CoreLogger + global singleton
**File**: `packages/core/src/logger/logger.ts`
**What**: `CoreLogger implements Logger`. Holds configured `minLevel` and a `LogSink`. Level-filters before calling `sink.write()`. Module-level `_logger` variable; `initLogger(config)` creates logger + FileSink + prunes old files; `getLogger()` returns `_logger ?? new NullLogger()`.
**Acceptance**: Messages below `minLevel` are not passed to sink; `getLogger()` before `initLogger()` returns no-op and doesn't throw.
**Test**: `packages/core/tests/logger/logger.test.ts` — covers: level filtering (debug suppressed at info level), null logger no-op, initLogger sets singleton.

---

### Task 1.5 — Logger index re-export
**File**: `packages/core/src/logger/index.ts`
**What**: Re-export `Logger`, `LogSink`, `LogLevel`, `initLogger`, `getLogger` from their respective modules.
**Acceptance**: Single import path for consumers.
**Test**: Compile test only (covered by downstream tasks).

---

### Task 1.6 — Old-file pruning in initLogger
**File**: `packages/core/src/logger/logger.ts` (extends Task 1.4)
**What**: On `initLogger`, scan `logDir` for `chloe-*.log` files; delete those with `mtime` older than `maxDays` days.
**Acceptance**: Files outside retention window deleted; files within window untouched.
**Test**: `file-sink.test.ts` or `logger.test.ts` — creates stale temp files, calls `initLogger`, verifies deletion.

---

## Phase 2 — Config integration

### Task 2.1 — Add LoggingConfig to config.ts
**File**: `packages/core/src/config.ts`
**What**: Add `LoggingConfig` interface; add `logging: LoggingConfig` to `ChloeConfig`; extend `loadConfig()` to read `[logging]` from TOML and merge `CHLOE_LOG_DIR` / `CHLOE_LOG_LEVEL` env vars; apply `expandHome` to `logDir`; resolve relative paths against `process.cwd()`.
**Acceptance**: `loadConfig()` returns correct `logging` field with all defaults and overrides applied. Existing tests still pass.
**Test**: Update/add config unit tests for `logging` field defaults, env var override, relative path resolution.

---

### Task 2.2 — Re-export from @chloe/core index
**File**: `packages/core/src/index.ts`
**What**: Add `export type { Logger, LogSink, LogLevel }` and `export { initLogger, getLogger }`.
**Acceptance**: `import { initLogger, getLogger } from "@chloe/core"` resolves correctly.
**Test**: Build check.

---

## Phase 3 — Entry point wiring

### Task 3.1 — Wire initLogger in api
**File**: `packages/api/src/index.ts`
**What**: Call `initLogger(cfg.logging)` immediately after `loadConfig()`. Add `log.info("server started", { port })` replacing `console.log`.
**Acceptance**: API server writes a startup log entry to file on launch.
**Test**: Manual smoke test (start server, check log file).

---

### Task 3.2 — Wire initLogger in cli commands
**Files**: `packages/cli/src/commands/chat.ts`, `packages/cli/src/commands/serve.ts`
**What**: In each command that calls `loadConfig()`, immediately follow with `initLogger(cfg.logging)`. The CLI `index.ts` dispatches synchronously before config is available, so `initLogger` must be called per-command. `configCommand` and `sessionsCommand` do not need logging.
**Acceptance**: `chloe chat` writes log entries; `chloe serve` writes a startup log entry.
**Test**: Manual smoke test (run command, verify log file created).

---

## Phase 4 — Instrumentation

### Task 4.1 — Instrument agent.ts
**File**: `packages/core/src/agent/agent.ts`
**What**: Add `getLogger()` calls:
- `info` "run started" with `session`, `model` at start of `run()`
- `info` "run completed" with `session`, `elapsed_ms` at end
- `error` "run failed" with `session`, `error` in catch
**Acceptance**: Agent run produces start/end log entries.

---

### Task 4.2 — Instrument loop.ts
**File**: `packages/core/src/agent/loop.ts`
**What**: Add `getLogger()` calls:
- `debug` "llm request" with `messages`, `model` before each stream call
- `info` "tool call" with `tool`, `input` (truncated 200 chars)
- `debug` "tool result" with `tool`, `output_len`
- `error` "tool error" with `tool`, `error`
- `debug` "tool denied" with `tool`
- `debug` "stop reason" with `reason`
**Acceptance**: Full ReAct loop is traceable in the log file.

---

### Task 4.3 — Instrument API handlers
**Files**: `packages/api/src/handlers/messages.ts`, `packages/api/src/handlers/sessions.ts`
**What**:
- `info` request with `method`, `path` at handler entry
- `debug` response with `status`, `elapsed_ms` at handler exit
**Acceptance**: Each API request produces an info entry.

---

### Task 4.4 — Instrument storage/sqlite.ts
**File**: `packages/core/src/storage/sqlite.ts`
**What**:
- `debug` "session created" with `session`
- `debug` "session loaded" with `session`, `message_count`
**Acceptance**: Storage operations visible at debug level.

---

### Task 4.5 — Log config-loaded event from entry points
**Files**: `packages/api/src/index.ts`, `packages/cli/src/commands/chat.ts`, `packages/cli/src/commands/serve.ts`
**What**: After `initLogger(cfg.logging)` in each entry point, add `getLogger().debug("config loaded", { provider: cfg.provider.name, db_path: cfg.storage.dbPath, log_dir: cfg.logging.logDir })`. Do **not** call this from `config.ts` itself — `loadConfig()` runs before `initLogger`, so the logger would be NullLogger and the entry would be silently dropped.
**Acceptance**: Config-loaded entry appears in log at debug level; no `apiKey` logged.
**Test**: Run with `CHLOE_LOG_LEVEL=debug`, verify entry appears.

---

## Phase 5 — Quality gate

### Task 5.1 — Run full test suite
**Command**: `bun test`
**Acceptance**: All existing and new tests pass.

### Task 5.2 — Run Biome
**Command**: `bunx biome check --error-on-warnings .`
**Acceptance**: Zero errors, zero warnings.

### Task 5.3 — TypeScript check
**Command**: `bunx tsc --noEmit -p tsconfig.check.json`
**Acceptance**: Zero type errors.

---

## Task dependency order

```
1.1 → 1.2 → 1.3 → 1.4 + 1.6 → 1.5
                     ↓
                   2.1 → 2.2 → 3.1 + 3.2
                                    ↓
                              4.1 + 4.2 + 4.3 + 4.4 + 4.5
                                    ↓
                                  5.1 + 5.2 + 5.3
```

Tasks 4.1–4.5 are independent of each other and can be done in parallel.
