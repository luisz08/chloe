import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { parse, stringify } from "smol-toml";
import type { LoggingConfig } from "./logger/types.js";

export interface ProviderConfig {
  apiKey: string;
  name: string;
  model: string;
  baseUrl: string;
}

export interface StorageConfig {
  dbPath: string;
}

export type { LoggingConfig };

export interface ChloeConfig {
  provider: ProviderConfig;
  storage: StorageConfig;
  logging: LoggingConfig;
}

export const CONFIG_PATH = join(homedir(), ".chloe", "settings", "config.toml");

const OLD_DB_PATH = join(homedir(), ".chloe", "chloe.db");
const DEFAULT_DB_PATH = join(homedir(), ".chloe", "sessions", "chloe.db");

const DEFAULTS = {
  providerName: "anthropic",
  model: "claude-sonnet-4-6",
  baseUrl: "",
  logLevel: "info",
  logMaxSizeMb: 10,
  logMaxDays: 7,
} as const;

export function expandHome(p: string): string {
  if (p.startsWith("~/")) return join(homedir(), p.slice(2));
  if (p === "~") return homedir();
  return p;
}

export function maskSecret(value: string): string {
  if (value.length < 8) return "***";
  return `${value.slice(0, 8)}***`;
}

function readTomlFile(path: string): Record<string, unknown> {
  const text = readFileSync(path, "utf-8");
  try {
    return parse(text) as Record<string, unknown>;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to parse config file at ${path}: ${msg}`);
  }
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function num(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

function resolveLogDir(raw: string): string {
  const expanded = expandHome(raw);
  if (isAbsolute(expanded)) return expanded;
  return resolve(process.cwd(), expanded);
}

function section(obj: Record<string, unknown>, key: string): Record<string, unknown> {
  const val = obj[key];
  return val !== null && typeof val === "object" && !Array.isArray(val)
    ? (val as Record<string, unknown>)
    : {};
}

function migrateDb(resolvedDbPath: string): void {
  if (existsSync(OLD_DB_PATH) && !existsSync(resolvedDbPath)) {
    renameSync(OLD_DB_PATH, resolvedDbPath);
    console.log(`Migrated database to ${resolvedDbPath}`);
  }
}

/** Load config from an explicit path (testable). */
export function loadConfigFrom(configPath: string): ChloeConfig {
  let fileProvider: Record<string, unknown> = {};
  let fileStorage: Record<string, unknown> = {};
  let fileLogging: Record<string, unknown> = {};

  if (existsSync(configPath)) {
    const raw = readTomlFile(configPath);
    fileProvider = section(raw, "provider");
    fileStorage = section(raw, "storage");
    fileLogging = section(raw, "logging");
  }

  // Merge: env var > file value > built-in default
  // Only non-empty env vars win; empty string falls through to file/default
  const apiKey = process.env.CHLOE_API_KEY || str(fileProvider.api_key);
  const name = process.env.CHLOE_PROVIDER || str(fileProvider.name) || DEFAULTS.providerName;
  const model = process.env.CHLOE_MODEL || str(fileProvider.model) || DEFAULTS.model;
  const baseUrl = process.env.CHLOE_BASE_URL ?? str(fileProvider.base_url);

  const rawDbPath = process.env.CHLOE_DB_PATH || str(fileStorage.db_path) || DEFAULT_DB_PATH;
  const dbPath = expandHome(rawDbPath);

  // Logging config
  const rawLogDir = process.env.CHLOE_LOG_DIR || str(fileLogging.log_dir) || "./logs";
  const logDir = resolveLogDir(rawLogDir);
  const logLevel = (process.env.CHLOE_LOG_LEVEL ||
    str(fileLogging.level) ||
    DEFAULTS.logLevel) as LoggingConfig["level"];
  const maxSizeMb = num(fileLogging.max_size_mb) ?? DEFAULTS.logMaxSizeMb;
  const maxDays = num(fileLogging.max_days) ?? DEFAULTS.logMaxDays;

  // Ensure sessions directory exists (covers fresh installs too)
  mkdirSync(dirname(dbPath), { recursive: true });

  // Migrate old flat db path if needed
  migrateDb(dbPath);

  return {
    provider: { apiKey, name, model, baseUrl },
    storage: { dbPath },
    logging: { logDir, level: logLevel, maxSizeMb, maxDays },
  };
}

export function loadConfig(): ChloeConfig {
  return loadConfigFrom(CONFIG_PATH);
}

/** Raw config values as stored in the file (snake_case, no env merge, no defaults). */
export interface RawFileConfig {
  provider: {
    api_key: string;
    name: string;
    model: string;
    base_url: string;
  };
  storage: {
    db_path: string;
  };
}

/** Read the config file as-is without merging env vars or applying defaults. */
export function readFileConfig(): RawFileConfig | null {
  if (!existsSync(CONFIG_PATH)) return null;
  const raw = readTomlFile(CONFIG_PATH);
  const p = section(raw, "provider");
  const s = section(raw, "storage");
  return {
    provider: {
      api_key: str(p.api_key),
      name: str(p.name),
      model: str(p.model),
      base_url: str(p.base_url),
    },
    storage: { db_path: str(s.db_path) },
  };
}

/** Update a single dotted key in the config file (creates file if absent). */
export function setConfigInFile(
  key:
    | "provider.api_key"
    | "provider.name"
    | "provider.model"
    | "provider.base_url"
    | "storage.db_path",
  value: string,
): void {
  const current = readFileConfig() ?? {
    provider: { api_key: "", name: "", model: "", base_url: "" },
    storage: { db_path: "" },
  };

  switch (key) {
    case "provider.api_key":
      current.provider.api_key = value;
      break;
    case "provider.name":
      current.provider.name = value;
      break;
    case "provider.model":
      current.provider.model = value;
      break;
    case "provider.base_url":
      current.provider.base_url = value;
      break;
    case "storage.db_path":
      current.storage.db_path = value;
      break;
  }

  const dir = dirname(CONFIG_PATH);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    CONFIG_PATH,
    stringify({ provider: current.provider, storage: current.storage }),
    "utf-8",
  );
  chmodSync(CONFIG_PATH, 0o600);
}

export function writeConfig(config: ChloeConfig): void {
  const dir = dirname(CONFIG_PATH);
  mkdirSync(dir, { recursive: true });

  const toml = stringify({
    provider: {
      api_key: config.provider.apiKey,
      name: config.provider.name,
      model: config.provider.model,
      base_url: config.provider.baseUrl,
    },
    storage: {
      db_path: config.storage.dbPath,
    },
  });

  writeFileSync(CONFIG_PATH, toml, "utf-8");
  chmodSync(CONFIG_PATH, 0o600);
}
