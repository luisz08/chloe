import { existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import type { MarketplaceManifest, PluginManifest } from "./types.js";

export function readPluginManifest(pluginDir: string): PluginManifest {
  const candidates = [
    join(pluginDir, ".chloe-plugin", "plugin.json"),
    join(pluginDir, ".claude-plugin", "plugin.json"),
  ];
  const manifestPath = candidates.find(existsSync);
  if (!manifestPath) {
    return { name: basename(pluginDir) };
  }
  try {
    return JSON.parse(readFileSync(manifestPath, "utf8")) as PluginManifest;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Invalid plugin.json at ${manifestPath}: ${msg}`);
  }
}

export function readMarketplaceManifest(marketplaceDir: string): MarketplaceManifest {
  const candidates = [
    join(marketplaceDir, ".chloe-plugin", "marketplace.json"),
    join(marketplaceDir, ".claude-plugin", "marketplace.json"),
  ];
  const manifestPath = candidates.find(existsSync);
  if (!manifestPath) {
    throw new Error(`Marketplace manifest not found: tried ${candidates.join(", ")}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Invalid marketplace.json at ${manifestPath}: ${msg}`);
  }
  validateMarketplaceManifest(parsed, manifestPath);
  return parsed as MarketplaceManifest;
}

export function validateMarketplaceManifest(data: unknown, filePath: string): void {
  if (typeof data !== "object" || data === null) {
    throw new Error(`marketplace.json must be an object: ${filePath}`);
  }
  const obj = data as Record<string, unknown>;
  if (typeof obj.name !== "string" || obj.name.length === 0) {
    throw new Error(`marketplace.json missing required field "name": ${filePath}`);
  }
  if (typeof obj.owner !== "object" || obj.owner === null) {
    throw new Error(`marketplace.json missing required field "owner": ${filePath}`);
  }
  if (!Array.isArray(obj.plugins)) {
    throw new Error(`marketplace.json missing required field "plugins": ${filePath}`);
  }
}
