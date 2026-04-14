export type LogLevel = "debug" | "info" | "warn" | "error";

export interface Logger {
  debug(msg: string, fields?: Record<string, unknown>): void;
  info(msg: string, fields?: Record<string, unknown>): void;
  warn(msg: string, fields?: Record<string, unknown>): void;
  error(msg: string, fields?: Record<string, unknown>): void;
}

export interface LogSink {
  write(level: LogLevel, component: string, msg: string, fields?: Record<string, unknown>): void;
}

export interface LoggingConfig {
  logDir: string;
  level: LogLevel;
  maxSizeMb: number;
  maxDays: number;
}
