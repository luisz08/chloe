# Data Model: Structured File Logging

**Branch**: `004-logging` | **Date**: 2026-04-14

## New Types

### `LogLevel` (union type)

```typescript
// packages/core/src/logger/types.ts
export type LogLevel = "debug" | "info" | "warn" | "error";
```

Ordered severity: `debug < info < warn < error`. A message is written only if its level is ≥ the configured minimum level.

---

### `Logger` (interface)

```typescript
export interface Logger {
  debug(msg: string, fields?: Record<string, unknown>): void;
  info(msg: string,  fields?: Record<string, unknown>): void;
  warn(msg: string,  fields?: Record<string, unknown>): void;
  error(msg: string, fields?: Record<string, unknown>): void;
}
```

`fields` is a flat object of extra key-value pairs appended to the log line. Values are serialised via `String(v)`; string values containing spaces are quoted.

---

### `LogSink` (interface)

```typescript
export interface LogSink {
  write(level: LogLevel, component: string, msg: string, fields?: Record<string, unknown>): void;
}
```

The extension point for future output targets. `FileSink` is the first implementation.

---

### `LoggingConfig` (config addition)

```typescript
// packages/core/src/config.ts  (addition)
export interface LoggingConfig {
  logDir: string;       // resolved absolute path; default: path.join(process.cwd(), "logs")
  level: LogLevel;      // default: "info"
  maxSizeMb: number;    // default: 10
  maxDays: number;      // default: 7
}
```

Merged into `ChloeConfig`:

```typescript
export interface ChloeConfig {
  provider: ProviderConfig;
  storage:  StorageConfig;
  logging:  LoggingConfig;    // NEW
}
```

---

## Config Merging Rules

| Key | Env var | Config file key | Default |
|-----|---------|-----------------|---------|
| `logDir` | `CHLOE_LOG_DIR` | `logging.log_dir` | `"./logs"` (resolved to absolute at load time) |
| `level` | `CHLOE_LOG_LEVEL` | `logging.level` | `"info"` |
| `maxSizeMb` | — | `logging.max_size_mb` | `10` |
| `maxDays` | — | `logging.max_days` | `7` |

Precedence (highest → lowest): env var → config file → built-in default. Same pattern as `provider.*` and `storage.*`.

---

## Log Line Format

```
<timestamp> [<LEVEL>] <component>: <message> [key=value ...]
```

| Field | Spec |
|-------|------|
| `timestamp` | `new Date().toISOString()` — UTC, millisecond precision, e.g. `2026-04-14T10:23:45.123Z` |
| `LEVEL` | Uppercase, space-padded to 5 chars: `DEBUG`, `INFO `, `WARN `, `ERROR` |
| `component` | Lowercase string passed by caller, e.g. `agent`, `loop`, `api`, `storage` |
| `message` | Free-form string |
| `key=value` | Zero or more; string values with spaces quoted; `input` fields truncated to 200 chars |

**Example**:
```
2026-04-14T10:23:45.123Z [INFO ] agent: run started session=abc123 model=claude-sonnet-4-6
2026-04-14T10:23:46.001Z [DEBUG] loop: llm request messages=3 model=claude-sonnet-4-6
2026-04-14T10:23:46.200Z [INFO ] loop: tool call tool=echo input={"message":"hi"}
2026-04-14T10:23:46.350Z [ERROR] loop: tool error tool=echo error="execution timeout"
2026-04-14T10:23:47.100Z [INFO ] agent: run completed session=abc123 elapsed_ms=1977
```

---

## File Naming & Rotation State

| File | Pattern | Description |
|------|---------|-------------|
| Active log | `chloe-YYYY-MM-DD.log` | Current writable file |
| Rotated log | `chloe-YYYY-MM-DD.N.log` | N ∈ {1, 2, …}; created on size overflow |

**Rotation algorithm** (on each write):
1. Check if `logDir/chloe-<today>.log` exists and `size >= maxSizeMb * 1024 * 1024`.
2. If yes: find lowest N where `chloe-<today>.N.log` does not exist; rename active file to that name.
3. Open (or create) fresh `chloe-<today>.log`.
4. Append the line.

**Pruning algorithm** (on `initLogger`):
1. `readdirSync(logDir)` filtered by `/^chloe-.+\.log$/`.
2. For each match: `statSync(f).mtime < Date.now() - maxDays * 86400000` → `unlinkSync(f)`.
