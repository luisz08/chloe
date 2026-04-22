import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { InstalledPluginRecord, MarketplaceRecord } from "./types.js";

const PLUGINS_ROOT = join(homedir(), ".chloe", "plugins");
const MARKETPLACES_FILE = join(PLUGINS_ROOT, "known_marketplaces.json");
const INSTALLED_FILE = join(PLUGINS_ROOT, "installed.json");

export function marketplaceCloneDir(name: string): string {
  return join(PLUGINS_ROOT, "marketplaces", name);
}

export function pluginCacheDir(id: string): string {
  return join(PLUGINS_ROOT, "cache", id);
}

export function readMarketplaces(): Record<string, MarketplaceRecord> {
  if (!existsSync(MARKETPLACES_FILE)) return {};
  try {
    return JSON.parse(readFileSync(MARKETPLACES_FILE, "utf8")) as Record<string, MarketplaceRecord>;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Corrupted plugin registry at ${MARKETPLACES_FILE}: ${msg}`);
  }
}

export function writeMarketplaces(data: Record<string, MarketplaceRecord>): void {
  mkdirSync(dirname(MARKETPLACES_FILE), { recursive: true });
  writeFileSync(MARKETPLACES_FILE, JSON.stringify(data, null, 2), "utf8");
}

export function readInstalled(): Record<string, InstalledPluginRecord> {
  if (!existsSync(INSTALLED_FILE)) return {};
  try {
    return JSON.parse(readFileSync(INSTALLED_FILE, "utf8")) as Record<
      string,
      InstalledPluginRecord
    >;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Corrupted plugin registry at ${INSTALLED_FILE}: ${msg}`);
  }
}

export function writeInstalled(data: Record<string, InstalledPluginRecord>): void {
  mkdirSync(dirname(INSTALLED_FILE), { recursive: true });
  writeFileSync(INSTALLED_FILE, JSON.stringify(data, null, 2), "utf8");
}
