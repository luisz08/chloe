# Reviewer Guide: Structured File Logging (`004-logging`)

**Branch**: `004-logging` | **Date**: 2026-04-14
**Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md) | **Tasks**: [tasks.md](tasks.md)

---

## What this feature adds

A structured file-logging module in `packages/core`. Writes rotating plain-text log lines to `./logs/chloe-YYYY-MM-DD.log`. Extensible via `LogSink` interface for future outputs (Prometheus, HTTP). No third-party dependencies.

---

## Coverage Matrix

| User Story | Tasks | Status |
|------------|-------|--------|
| US1: Logs written to file during agent run | 1.1–1.5, 2.1–2.2, 3.1–3.2, 4.1–4.2 | ✅ |
| US2: Log rotation by file size | 1.3 | ✅ |
| US3: Log retention by age | 1.6 | ✅ |
| US4: Config via `config.toml` / env vars | 2.1 | ✅ |
| US5: Extensible `LogSink` interface | 1.1 | ✅ |

---

## Key review areas

### 1. Logger types (`packages/core/src/logger/types.ts`)
- `LogLevel` union must be `"debug" | "info" | "warn" | "error"` in severity order
- `Logger` interface methods must all accept optional `fields?: Record<string, unknown>`
- `LogSink.write()` signature must include `component` so sinks can route/label output

### 2. Formatter (`packages/core/src/logger/formatter.ts`)
- Timestamp: `new Date().toISOString()` — UTC, millisecond precision
- Level padding: `"INFO "` (5 chars), `"DEBUG"`, `"WARN "`, `"ERROR"`
- String field values containing spaces must be quoted: `error="execution timeout"`
- `input` fields must be truncated to 200 chars

### 3. FileSink rotation (`packages/core/src/logger/file-sink.ts`)
- Size check: `statSync(path).size` before each write
- Rotation: rename → find next free `.N.log` → open fresh file
- Must **not** lose the line that triggered rotation

### 4. Level filtering (`packages/core/src/logger/logger.ts`)
- Filtering happens in `CoreLogger.{debug,info,warn,error}()` before calling `sink.write()`
- `getLogger()` before `initLogger()` must return `NullLogger`, never `null` or throw

### 5. Config integration (`packages/core/src/config.ts`)
- `CHLOE_LOG_DIR` and `CHLOE_LOG_LEVEL` env vars must override config file
- Relative `log_dir` paths must be resolved against `process.cwd()` (same pattern as `dbPath`)
- `expandHome` must be applied to `logDir`

### 6. Entry point wiring
- `initLogger` must be called **after** `loadConfig()` and **before** any `getLogger()` usage
- CLI: called in `chatCommand` and `serveCommand` (not `configCommand` or `sessionsCommand`)
- API: called in `packages/api/src/index.ts`

### 7. Instrumentation points
- **Must not** log `apiKey` or any secret at any level
- Tool `input` fields must be truncated to 200 chars at all log call sites
- `elapsed_ms` in agent run-completed/request-response must use `Date.now()` diff

---

## Tests to verify

| Test file | Covers |
|-----------|--------|
| `packages/core/tests/logger/formatter.test.ts` | All level formats, field quoting, truncation |
| `packages/core/tests/logger/file-sink.test.ts` | Write creates file; rotation at threshold; N increments |
| `packages/core/tests/logger/logger.test.ts` | Level filtering; NullLogger before init; singleton set by initLogger; pruning deletes old files |

---

## Non-goals (do not add)

- No stdout/stderr output from the logger
- No JSON format
- No per-component log levels
- No log streaming endpoint
- No compression of rotated files
- No `chloe config set logging.*` command support

---

## Constitution compliance checklist

- [ ] All new files pass `biome check --error-on-warnings`
- [ ] No `any` types; no `as` casts except at system boundaries
- [ ] Logger lives in `packages/core` only; entry points are thin wiring
- [ ] `LogSink` interface is the extension point (Plugin Contracts principle)
- [ ] Unit tests cover formatter, level filtering, rotation, pruning
- [ ] `bun test` passes with no failures
- [ ] `bunx tsc --noEmit -p tsconfig.check.json` passes
