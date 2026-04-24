import { existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { buildGitHubUrl, gitClone, gitPull } from "./git.js";
import { readMarketplaceManifest } from "./manifest.js";
import {
  marketplaceCloneDir,
  readInstalled,
  readMarketplaces,
  writeInstalled,
  writeMarketplaces,
} from "./storage.js";
import {
  type MarketplacePluginEntry,
  type MarketplaceRecord,
  MarketplaceSourceType,
} from "./types.js";

function tempDir(): string {
  return join(
    homedir(),
    ".chloe",
    "plugins",
    `.tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
}

export async function addMarketplace(source: string, fromDir?: string): Promise<string> {
  const marketplaces = readMarketplaces();

  if (fromDir) {
    const absPath = resolve(fromDir);
    const manifest = readMarketplaceManifest(absPath);
    const { name } = manifest;

    const existing = Object.values(marketplaces).find(
      (m) => m.source.type === MarketplaceSourceType.Local && m.source.path === absPath,
    );
    if (existing) {
      throw new Error(`Marketplace already registered: ${existing.name}`);
    }

    const record: MarketplaceRecord = {
      name,
      addedAt: new Date().toISOString(),
      source: { type: MarketplaceSourceType.Local, path: absPath },
      cloneDir: null,
    };
    marketplaces[name] = record;
    writeMarketplaces(marketplaces);
    return name;
  }

  const existing = Object.values(marketplaces).find(
    (m) => m.source.type === MarketplaceSourceType.Github && m.source.repo === source,
  );
  if (existing) {
    throw new Error(`Marketplace already registered: ${existing.name}`);
  }

  const url = buildGitHubUrl(source);
  const tmp = tempDir();
  try {
    await gitClone(url, tmp);
    const manifest = readMarketplaceManifest(tmp);
    const { name } = manifest;
    const finalDir = marketplaceCloneDir(name);
    mkdirSync(join(finalDir, ".."), { recursive: true });
    renameSync(tmp, finalDir);

    const record: MarketplaceRecord = {
      name,
      addedAt: new Date().toISOString(),
      source: { type: MarketplaceSourceType.Github, repo: source },
      cloneDir: finalDir,
    };
    marketplaces[name] = record;
    writeMarketplaces(marketplaces);
    return name;
  } catch (err) {
    if (existsSync(tmp)) {
      rmSync(tmp, { recursive: true, force: true });
    }
    throw err;
  }
}

export function listMarketplaces(): MarketplaceRecord[] {
  return Object.values(readMarketplaces());
}

export async function removeMarketplace(name: string): Promise<void> {
  const marketplaces = readMarketplaces();
  const record = marketplaces[name];
  if (!record) {
    throw new Error(`Marketplace not found: ${name}`);
  }

  const installed = readInstalled();
  for (const plugin of Object.values(installed)) {
    if (plugin.marketplace === name) {
      await uninstallMarketplacePlugin(plugin.id, installed);
    }
  }
  writeInstalled(installed);

  delete marketplaces[name];
  if (record.cloneDir && existsSync(record.cloneDir)) {
    rmSync(record.cloneDir, { recursive: true, force: true });
  }
  writeMarketplaces(marketplaces);
}

async function uninstallMarketplacePlugin(
  id: string,
  installed: Record<string, import("./types.js").InstalledPluginRecord>,
): Promise<void> {
  const { pluginCacheDir } = await import("./storage.js");
  const cacheDir = pluginCacheDir(id);
  if (existsSync(cacheDir)) {
    rmSync(cacheDir, { recursive: true, force: true });
  }
  delete installed[id];
}

export async function updateMarketplace(name?: string): Promise<void> {
  const marketplaces = readMarketplaces();
  const targets = name ? [marketplaces[name]] : Object.values(marketplaces);

  for (const record of targets) {
    if (!record) {
      throw new Error(`Marketplace not found: ${name}`);
    }
    if (record.source.type === MarketplaceSourceType.Local) {
      continue;
    }
    if (record.cloneDir) {
      await gitPull(record.cloneDir);
    }
  }
}

export function getMarketplacePlugins(name: string): MarketplacePluginEntry[] {
  const marketplaces = readMarketplaces();
  const record = marketplaces[name];
  if (!record) {
    throw new Error(`Marketplace not found: ${name}`);
  }
  const dir =
    record.source.type === MarketplaceSourceType.Local
      ? record.source.path
      : (record.cloneDir ?? "");
  const manifest = readMarketplaceManifest(dir);
  return manifest.plugins;
}
