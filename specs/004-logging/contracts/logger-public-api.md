# Contract: Logger Public API (`@chloe/core` exports)

**Branch**: `004-logging` | **Date**: 2026-04-14

## Exported symbols

```typescript
// from @chloe/core (packages/core/src/index.ts)

export type { Logger, LogSink, LogLevel } from "./logger/index.js";
export { initLogger, getLogger } from "./logger/index.js";
```

---

## `initLogger(config: LoggingConfig): void`

Initialises the global logger singleton. Must be called once, at process startup, before any log calls. Subsequent calls replace the existing logger.

**Side effects on call**:
1. Ensures `config.logDir` directory exists (creates recursively if absent).
2. Prunes log files in `logDir` older than `config.maxDays` days.
3. Sets the active logger to a `CoreLogger` backed by a `FileSink`.

**Entry point usage**:
```typescript
// packages/api/src/index.ts
import { initLogger, loadConfig } from "@chloe/core";
const cfg = loadConfig();
initLogger(cfg.logging);

// packages/cli/src/commands/chat.ts  (and other commands)
import { initLogger, loadConfig } from "@chloe/core";
const cfg = loadConfig();
initLogger(cfg.logging);
```

---

## `getLogger(): Logger`

Returns the active global logger. If `initLogger` has not been called, returns a `NullLogger` (all methods are no-ops). Never throws.

**Usage at call sites**:
```typescript
import { getLogger } from "@chloe/core";

const log = getLogger();
log.info("run started", { session: sessionId, model });
log.error("tool error", { tool: toolName, error: message });
```

---

## `Logger` interface

```typescript
interface Logger {
  debug(msg: string, fields?: Record<string, unknown>): void;
  info(msg:  string, fields?: Record<string, unknown>): void;
  warn(msg:  string, fields?: Record<string, unknown>): void;
  error(msg: string, fields?: Record<string, unknown>): void;
}
```

All methods are synchronous. Return type is `void`. Never throw (errors in FileSink are silently swallowed to avoid crashing the app over a logging failure).

---

## `LogSink` interface

```typescript
interface LogSink {
  write(
    level:     LogLevel,
    component: string,
    msg:       string,
    fields?:   Record<string, unknown>,
  ): void;
}
```

Implementors of `LogSink` can be registered with `CoreLogger` (internal API) for multi-sink scenarios in the future.

---

## Stability

- `Logger`, `LogSink`, `LogLevel`: **stable** — part of public API, safe for external code to depend on.
- `initLogger`, `getLogger`: **stable** — called by all packages.
- `CoreLogger`, `FileSink`, `NullLogger`: **internal** — not exported from `packages/core/src/index.ts`; implementation details subject to change.
