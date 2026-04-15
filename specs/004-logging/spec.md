# Feature Specification: Structured File Logging

**Feature Branch**: `004-logging`
**Created**: 2026-04-14
**Status**: Shipped
**Input**: Add a logging module to `packages/core` that writes structured text logs to rotating files. Designed for extensibility (future sinks: Prometheus, HTTP) but currently implements file logging only. Helps with debugging and issue investigation.

---

## User Scenarios & Testing

### User Story 1 — Logs are written to file during agent run (Priority: P1)

A developer runs `chloe chat`, has a conversation, then inspects `./logs/chloe-YYYY-MM-DD.log` to trace what happened.

**Why this priority**: Core value of the feature. Every other story depends on log files being produced.

**Independent Test**: Run `chloe chat --session test`, send a message, exit. Verify `./logs/chloe-<today>.log` exists and contains timestamped entries for the session start, LLM call, and tool calls.

**Acceptance Scenarios**:

1. **Given** no `[logging]` section in config, **When** the app starts, **Then** it creates `./logs/` (relative to cwd) and begins writing logs at `info` level.
2. **Given** a user sends a message to the agent, **When** the agent runs, **Then** the log file contains entries for: session start (info), each tool call (info), any tool errors (error), and session end (info).
3. **Given** the log file is being written, **When** a developer opens it, **Then** every line is human-readable plain text with: ISO 8601 UTC timestamp, padded level, component name, message, and `key=value` fields.
4. **Given** the app is running, **When** an error occurs (e.g. tool throws), **Then** an `[ERROR]` entry appears in the log with the error message and relevant context fields.

---

### User Story 2 — Log rotation by file size (Priority: P2)

A long-running deployment does not fill the disk with a single giant log file.

**Why this priority**: Production safety. Without rotation, the logs directory grows unbounded.

**Independent Test**: Set `max_size_mb = 1` in config, write enough log entries to exceed 1 MB, verify a rotated file `chloe-YYYY-MM-DD.1.log` is created and a fresh `chloe-YYYY-MM-DD.log` continues.

**Acceptance Scenarios**:

1. **Given** `max_size_mb = 10` (default), **When** the active log file reaches 10 MB, **Then** it is renamed to `chloe-YYYY-MM-DD.N.log` (N = next available integer) and a new `chloe-YYYY-MM-DD.log` is opened.
2. **Given** multiple rotations happen on the same day, **When** each rotation occurs, **Then** files are named `.1.log`, `.2.log`, etc. — no data is overwritten or lost.

---

### User Story 3 — Log retention by age (Priority: P2)

Old log files are automatically pruned so the logs directory stays bounded over time.

**Why this priority**: Complements size rotation. Without age pruning, rotated files accumulate indefinitely.

**Independent Test**: Create log files with `mtime` older than `max_days`, start the app, verify those files are deleted and recent files are kept.

**Acceptance Scenarios**:

1. **Given** `max_days = 7` (default), **When** the app starts, **Then** all `chloe-*.log` files with `mtime` older than 7 days in `log_dir` are deleted.
2. **Given** log files within the retention window, **When** the app starts, **Then** those files are not modified or deleted.

---

### User Story 4 — Logging configuration via `config.toml` (Priority: P2)

A developer customises log output to match their deployment environment.

**Why this priority**: Different environments (dev laptop vs. server) have different needs for path and verbosity.

**Independent Test**: Set `log_dir = "/var/log/chloe"`, `level = "debug"`, `max_size_mb = 5`, `max_days = 3` in `config.toml`. Start app, verify logs appear in the specified directory at debug verbosity.

**Acceptance Scenarios**:

1. **Given** `log_dir` is set in config, **When** the app starts, **Then** log files are written to that directory (created if absent).
2. **Given** `level = "debug"`, **When** the agent runs, **Then** debug-level entries (LLM call start, tool results, stop reasons) appear in the log file.
3. **Given** `level = "warn"`, **When** the agent runs, **Then** only `warn` and `error` entries appear; info and debug entries are suppressed.
4. **Given** `CHLOE_LOG_DIR` or `CHLOE_LOG_LEVEL` env vars are set, **When** the app starts, **Then** they override the config file values (same precedence rule as other config keys).

---

### User Story 5 — Logger is extensible for future sinks (Priority: P3)

A future contributor can add a new output target (e.g. Prometheus counter, HTTP endpoint) without modifying the Logger interface or any call site.

**Why this priority**: Architectural constraint, not an immediate runtime requirement. Validated by design, not an end-to-end test.

**Acceptance Scenarios**:

1. **Given** the `LogSink` interface, **When** a developer implements it, **Then** they can register it with the logger without touching `Logger`, `Agent`, `loop`, or any other file.
2. **Given** a `NullSink` (no-op), **When** used in unit tests, **Then** tests run without creating files or requiring configuration.

---

## Data Model

### Config additions (`packages/core/src/config.ts`)

```typescript
export interface LoggingConfig {
  logDir: string;      // resolved absolute path; default: "<cwd>/logs"
  level: LogLevel;     // default: "info"
  maxSizeMb: number;   // default: 10
  maxDays: number;     // default: 7
}

// ChloeConfig gains:
export interface ChloeConfig {
  provider: ProviderConfig;
  storage: StorageConfig;
  logging: LoggingConfig;   // NEW
}
```

### `config.toml` new section

```toml
[logging]
log_dir     = "./logs"   # relative to cwd, or absolute
level       = "info"
max_size_mb = 10
max_days    = 7
```

### Log line format

```
<timestamp> [<LEVEL>] <component>: <message> [key=value ...]
```

- `timestamp`: ISO 8601, UTC, millisecond precision (`2026-04-14T10:23:45.123Z`)
- `LEVEL`: uppercase, space-padded to 5 chars (`DEBUG`, `INFO `, `WARN `, `ERROR`)
- `component`: lowercase identifier (`agent`, `loop`, `api`, `storage`, `config`)
- `key=value` fields: space-separated; string values containing spaces are quoted

Example:
```
2026-04-14T10:23:45.123Z [INFO ] agent: run started session=abc123 model=claude-sonnet-4-6
2026-04-14T10:23:46.001Z [DEBUG] loop: llm request messages=3 model=claude-sonnet-4-6
2026-04-14T10:23:46.200Z [INFO ] loop: tool call tool=echo input={"message":"hi"}
2026-04-14T10:23:46.350Z [ERROR] loop: tool error tool=echo error="execution timeout"
2026-04-14T10:23:47.100Z [INFO ] agent: run completed session=abc123 elapsed_ms=1977
```

---

## Architecture

### New files

```
packages/core/src/logger/
  types.ts       — LogLevel, Logger interface, LogSink interface
  formatter.ts   — formatLine(level, component, msg, fields) → string
  file-sink.ts   — FileSink implements LogSink (rotation + pruning)
  logger.ts      — CoreLogger implements Logger; holds sink list; global init/get
  index.ts       — re-exports: Logger, LogSink, LogLevel, initLogger, getLogger
```

### Key design decisions

1. **`Logger` calls `LogSink.write()`** — Logger handles level filtering; Sink handles I/O. Adding a Prometheus sink = implement `LogSink`, call `logger.addSink(prometheusSync)`.
2. **Global singleton via `initLogger` / `getLogger`** — `api` and `cli` entry points call `initLogger(config.logging)` at startup. All modules call `getLogger()`. Before `initLogger`, `getLogger()` returns a `NullLogger` (no-op, no errors).
3. **No third-party logging library** — Bun's built-in `Bun.file` / `node:fs` write is sufficient; avoids dependency bloat.
4. **Synchronous writes** — Use `appendFileSync` to avoid out-of-order log lines across async boundaries. Acceptable for this workload (personal assistant, not high-throughput server).
5. **`input` field truncation** — Tool input fields are truncated to 200 chars in log lines to prevent unbounded line length.

### Instrumentation points

| File | Level | Event | Fields |
|------|-------|-------|--------|
| `agent.ts` | `info` | run started | `session`, `model` |
| `agent.ts` | `info` | run completed | `session`, `elapsed_ms` |
| `agent.ts` | `error` | run failed | `session`, `error` |
| `loop.ts` | `debug` | llm request | `messages`, `model` |
| `loop.ts` | `info` | tool call | `tool`, `input` (truncated) |
| `loop.ts` | `debug` | tool result | `tool`, `output_len` |
| `loop.ts` | `error` | tool error | `tool`, `error` |
| `loop.ts` | `debug` | tool denied | `tool` |
| `loop.ts` | `debug` | stop reason | `reason` |
| `api/index.ts` | `info` | server started | `port` |
| `api/handlers` | `info` | request | `method`, `path` |
| `api/handlers` | `debug` | response | `status`, `elapsed_ms` |
| `config.ts` | `debug` | config loaded | `provider`, `db_path`, `log_dir` |
| `storage/sqlite.ts` | `debug` | session created | `session` |
| `storage/sqlite.ts` | `debug` | session loaded | `session`, `message_count` |

---

## Constraints & Non-Goals

- **File only** — No stdout/stderr output from the logger (terminal stays clean for CLI UX).
- **No structured JSON** — Plain text format only. JSON format is a future option.
- **No log streaming API** — Logs are written to files; no WebSocket/SSE tail endpoint.
- **No per-component log levels** — Single global `level` setting.
- **No compression** — Rotated files are stored as plain `.log` files.
