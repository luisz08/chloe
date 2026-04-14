import { appendFileSync, existsSync, renameSync, statSync } from "node:fs";
import { join } from "node:path";
import { formatLine } from "./formatter.js";
import type { LogLevel, LogSink } from "./types.js";

export interface FileSinkOptions {
  logDir: string;
  maxSizeMb: number;
}

export class FileSink implements LogSink {
  private readonly logDir: string;
  private readonly maxBytes: number;

  constructor(opts: FileSinkOptions) {
    this.logDir = opts.logDir;
    this.maxBytes = opts.maxSizeMb * 1024 * 1024;
  }

  write(level: LogLevel, component: string, msg: string, fields?: Record<string, unknown>): void {
    const activeFile = this.activeFilePath();
    this.rotateIfNeeded(activeFile);
    const line = formatLine(level, component, msg, fields);
    appendFileSync(activeFile, `${line}\n`, "utf-8");
  }

  private activeFilePath(): string {
    return join(this.logDir, `chloe-${todayDate()}.log`);
  }

  private rotateIfNeeded(filePath: string): void {
    if (!existsSync(filePath)) return;
    const size = statSync(filePath).size;
    if (size < this.maxBytes) return;

    const base = filePath.slice(0, -4); // strip .log
    let n = 1;
    while (existsSync(`${base}.${n}.log`)) {
      n++;
    }
    renameSync(filePath, `${base}.${n}.log`);
  }
}

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}
