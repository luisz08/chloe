# Research: Structured File Logging

**Branch**: `004-logging` | **Date**: 2026-04-14

## Decision 1: File I/O API

**Decision**: Use `node:fs` synchronous APIs (`appendFileSync`, `statSync`, `readdirSync`, `renameSync`, `unlinkSync`, `mkdirSync`).

**Rationale**: Bun fully supports `node:fs` built-ins. Synchronous writes guarantee log line ordering across async boundaries — critical when `runLoop` calls are interleaved. The workload is a personal assistant (tens of log lines per interaction), so sync overhead is negligible.

**Alternatives considered**:
- `Bun.file` write API — async-only, would require await at every log call site, risking out-of-order lines.
- `winston` / `pino` — third-party dependencies; constitution prohibits new deps unless justified; unnecessary for this scope.

---

## Decision 2: Log rotation strategy

**Decision**: Size-based rotation (rename on size threshold) + daily file naming (`chloe-YYYY-MM-DD.log`). Check file size before each write using `statSync`.

**Rationale**: Daily naming gives natural human-readable partitioning. Size check before write is cheap (one syscall). Rename-then-create is atomic enough for a single-process app (no log shipping daemon race condition).

**Rotation filename**: `chloe-YYYY-MM-DD.N.log` where N starts at 1 and increments until a free name is found. Simple and recoverable if the process crashes mid-rotation.

**Alternatives considered**:
- Time-based rotation only — doesn't bound file size; rejected.
- `inode` reuse (truncate) — loses data; rejected.
- External logrotate — requires OS-level config; rejected for portability.

---

## Decision 3: Old file pruning

**Decision**: Scan `log_dir` on startup for `chloe-*.log` files; delete those whose `mtime` is older than `max_days * 24 * 60 * 60 * 1000` ms.

**Rationale**: Startup-time scan is the simplest approach — no background timer, no cron. For a personal assistant, pruning on startup (once per session) is sufficient.

**Edge case**: Rotated files (`.1.log`, `.2.log`) share the same date prefix and are pruned by age like any other match.

---

## Decision 4: Global singleton pattern

**Decision**: Module-level `let _logger: CoreLogger | null = null`. `initLogger(config)` sets it; `getLogger()` returns it or a `NullLogger` if not yet initialised.

**Rationale**: Matches the project's existing singleton pattern (SQLiteStorageAdapter constructed once in entry points). Avoids passing a logger through every constructor and function signature. `NullLogger` prevents crashes in unit tests that don't call `initLogger`.

**Alternatives considered**:
- Dependency injection (pass logger everywhere) — too verbose for this codebase size.
- `AsyncLocalStorage` context — overkill for a single-agent personal app.

---

## Decision 5: No third-party libraries

**Decision**: Implement formatter, FileSink, and CoreLogger from scratch (~150 lines total).

**Rationale**: Constitution principle II/III require strict TypeScript + Biome; adding `pino`, `winston`, or `log4js` would pull in types that may conflict with `exactOptionalPropertyTypes`. The logging spec is simple enough that a bespoke implementation is lower risk than dependency management.

---

## Resolved Clarifications

All items from Technical Context were straightforward given Bun's `node:fs` compatibility. No NEEDS CLARIFICATION items remain.
