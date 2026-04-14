# Quickstart: Structured File Logging

**Branch**: `004-logging` | **Date**: 2026-04-14

## For users

By default, logs are written to `./logs/chloe-YYYY-MM-DD.log` relative to where you run the `chloe` command. No configuration needed.

To customise, add a `[logging]` section to `~/.chloe/settings/config.toml`:

```toml
[logging]
log_dir     = "~/.chloe/logs"   # absolute or ~/... path
level       = "debug"            # debug | info | warn | error
max_size_mb = 10                 # rotate after this many MB
max_days    = 7                  # delete files older than N days
```

Or via environment variables:

```bash
CHLOE_LOG_DIR=/tmp/chloe-logs CHLOE_LOG_LEVEL=debug chloe chat
```

## For developers adding log calls

```typescript
import { getLogger } from "@chloe/core";

// get once per component (top of file or inside class)
const log = getLogger();

log.debug("llm request", { messages: messages.length, model });
log.info("tool call", { tool: toolName, input: JSON.stringify(toolInput).slice(0, 200) });
log.warn("session missing, creating new", { session: sessionId });
log.error("tool error", { tool: toolName, error: message });
```

Fields are optional `Record<string, unknown>`. String values with spaces are auto-quoted.

## For developers adding a new sink

Implement `LogSink` and register it:

```typescript
import type { LogSink, LogLevel } from "@chloe/core";

class MyCustomSink implements LogSink {
  write(level: LogLevel, component: string, msg: string, fields?: Record<string, unknown>): void {
    // your output logic here
  }
}

// In entry point, after initLogger():
import { getLogger } from "@chloe/core";
// CoreLogger.addSink() is internal — extend via initLogger options in a future release
```

(Full multi-sink API is deferred to a future spec; today's `initLogger` creates exactly one `FileSink`.)

## Viewing logs

```bash
# tail the current day's log
tail -f logs/chloe-$(date +%Y-%m-%d).log

# filter for errors only
grep '\[ERROR\]' logs/chloe-*.log

# follow debug output
CHLOE_LOG_LEVEL=debug chloe chat --session test
tail -f logs/chloe-$(date +%Y-%m-%d).log
```
