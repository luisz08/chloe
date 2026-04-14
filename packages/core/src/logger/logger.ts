import { mkdirSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { FileSink } from "./file-sink.js";
import type { LogLevel, LogSink, Logger, LoggingConfig } from "./types.js";

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

class CoreLogger {
  private readonly minLevel: number;
  readonly sink: LogSink;

  constructor(config: LoggingConfig, sink: LogSink) {
    this.minLevel = LEVEL_ORDER[config.level];
    this.sink = sink;
  }

  forComponent(component: string): Logger {
    return new ComponentLogger(this, component);
  }

  shouldLog(level: LogLevel): boolean {
    return LEVEL_ORDER[level] >= this.minLevel;
  }
}

class ComponentLogger implements Logger {
  private readonly core: CoreLogger;
  private readonly component: string;

  constructor(core: CoreLogger, component: string) {
    this.core = core;
    this.component = component;
  }

  debug(msg: string, fields?: Record<string, unknown>): void {
    this.log("debug", msg, fields);
  }

  info(msg: string, fields?: Record<string, unknown>): void {
    this.log("info", msg, fields);
  }

  warn(msg: string, fields?: Record<string, unknown>): void {
    this.log("warn", msg, fields);
  }

  error(msg: string, fields?: Record<string, unknown>): void {
    this.log("error", msg, fields);
  }

  private log(level: LogLevel, msg: string, fields?: Record<string, unknown>): void {
    if (!this.core.shouldLog(level)) return;
    try {
      this.core.sink.write(level, this.component, msg, fields);
    } catch {
      // never crash the app over a logging failure
    }
  }
}

class NullLogger implements Logger {
  debug(): void {}
  info(): void {}
  warn(): void {}
  error(): void {}
}

let _coreLogger: CoreLogger | null = null;
const _nullLogger: Logger = new NullLogger();

export function initLogger(config: LoggingConfig, sink?: LogSink): void {
  mkdirSync(config.logDir, { recursive: true });
  pruneOldFiles(config.logDir, config.maxDays);
  const activeSink = sink ?? new FileSink({ logDir: config.logDir, maxSizeMb: config.maxSizeMb });
  _coreLogger = new CoreLogger(config, activeSink);
}

export function getLogger(component = "app"): Logger {
  if (_coreLogger) return _coreLogger.forComponent(component);
  return _nullLogger;
}

/** Test-only: reset singleton */
export function resetLogger(): void {
  _coreLogger = null;
}

function pruneOldFiles(logDir: string, maxDays: number): void {
  const cutoff = Date.now() - maxDays * 24 * 60 * 60 * 1000;
  let entries: string[];
  try {
    entries = readdirSync(logDir);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (!/^chloe-.+\.log$/.test(entry)) continue;
    const filePath = join(logDir, entry);
    try {
      const mtime = statSync(filePath).mtimeMs;
      if (mtime < cutoff) {
        unlinkSync(filePath);
      }
    } catch {
      // skip files we can't stat or delete
    }
  }
}
