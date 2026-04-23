import { cpSync, existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve, sep } from "node:path";
import { buildGitHubUrl, gitClone } from "./git.js";
import { readPluginManifest } from "./manifest.js";
import {
  marketplaceCloneDir,
  pluginCacheDir,
  readInstalled,
  readMarketplaces,
  writeInstalled,
} from "./storage.js";
import type { InstalledPluginRecord, PluginSourceSpec } from "./types.js";

function tempDir(label: string): string {
  return join(homedir(), ".chloe", "plugins", `.tmp-${label}-${Date.now()}`);
}

export async function installPlugin(pluginName: string, marketplaceName: string): Promise<void> {
  const id = `${pluginName}@${marketplaceName}`;
  const installed = readInstalled();
  if (installed[id]) {
    throw new Error(`Plugin already installed: ${id}`);
  }

  const marketplaces = readMarketplaces();
  const marketplace = marketplaces[marketplaceName];
  if (!marketplace) {
    throw new Error(`Marketplace not found: ${marketplaceName}`);
  }

  const { getMarketplacePlugins } = await import("./marketplace.js");
  const plugins = getMarketplacePlugins(marketplaceName);
  const entry = plugins.find((p) => p.name === pluginName);
  if (!entry) {
    throw new Error(`Plugin "${pluginName}" not found in marketplace "${marketplaceName}"`);
  }

  const mktDir =
    marketplace.source.type === "local"
      ? marketplace.source.path
      : (marketplace.cloneDir ?? marketplaceCloneDir(marketplaceName));

  const cacheDir = pluginCacheDir(id);
  await resolvePluginSource(entry.source, mktDir, cacheDir);

  const manifest = readPluginManifest(cacheDir);
  const record: InstalledPluginRecord = {
    id,
    name: pluginName,
    marketplace: marketplaceName,
    version: manifest.version ?? "unknown",
    enabled: true,
    cacheDir,
    installedAt: new Date().toISOString(),
  };
  installed[id] = record;
  writeInstalled(installed);
}

export async function resolvePluginSource(
  source: PluginSourceSpec,
  mktDir: string,
  cacheDir: string,
): Promise<void> {
  mkdirSync(join(cacheDir, ".."), { recursive: true });

  if (typeof source === "string") {
    const srcPath = resolve(mktDir, source);
    const containmentRoot = resolve(mktDir) + sep;
    if (!srcPath.startsWith(containmentRoot)) {
      throw new Error(`Plugin source escapes marketplace directory: ${source}`);
    }
    cpSync(srcPath, cacheDir, { recursive: true });
    return;
  }

  // Validate repo name to prevent flag injection and path traversal
  if (!/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(source.repo)) {
    throw new Error(`Invalid plugin repo format: ${source.repo}`);
  }

  const url = buildGitHubUrl(source.repo);
  const tmp = tempDir(source.repo.replaceAll("/", "-"));
  try {
    await gitClone(url, tmp);
    cpSync(tmp, cacheDir, { recursive: true });
  } finally {
    if (existsSync(tmp)) {
      rmSync(tmp, { recursive: true, force: true });
    }
  }
}

export function uninstallPlugin(id: string): void {
  const installed = readInstalled();
  if (!installed[id]) {
    throw new Error(`Plugin not installed: ${id}`);
  }
  delete installed[id];
  writeInstalled(installed);

  const cacheDir = pluginCacheDir(id);
  if (existsSync(cacheDir)) {
    rmSync(cacheDir, { recursive: true, force: true });
  }
}

export function enablePlugin(id: string): void {
  const installed = readInstalled();
  const record = installed[id];
  if (!record) {
    throw new Error(`Plugin not installed: ${id}`);
  }
  record.enabled = true;
  writeInstalled(installed);
}

export function disablePlugin(id: string): void {
  const installed = readInstalled();
  const record = installed[id];
  if (!record) {
    throw new Error(`Plugin not installed: ${id}`);
  }
  record.enabled = false;
  writeInstalled(installed);
}

export async function updatePlugin(id: string): Promise<void> {
  const installed = readInstalled();
  const record = installed[id];
  if (!record) {
    throw new Error(`Plugin not installed: ${id}`);
  }

  const { getMarketplacePlugins } = await import("./marketplace.js");
  const plugins = getMarketplacePlugins(record.marketplace);
  const entry = plugins.find((p) => p.name === record.name);
  if (!entry) {
    throw new Error(`Plugin "${record.name}" not found in marketplace "${record.marketplace}"`);
  }

  const latestVersion = entry.version ?? "unknown";
  if (record.version !== "unknown" && record.version === latestVersion) {
    return;
  }

  const marketplaces = readMarketplaces();
  const marketplace = marketplaces[record.marketplace];
  if (!marketplace) {
    throw new Error(`Marketplace not found: ${record.marketplace}`);
  }

  const mktDir =
    marketplace.source.type === "local"
      ? marketplace.source.path
      : (marketplace.cloneDir ?? marketplaceCloneDir(record.marketplace));

  const cacheDir = pluginCacheDir(id);
  const tmpDir = tempDir(`update-${record.name}`);
  await resolvePluginSource(entry.source, mktDir, tmpDir);
  if (existsSync(cacheDir)) {
    rmSync(cacheDir, { recursive: true, force: true });
  }
  renameSync(tmpDir, cacheDir);

  const manifest = readPluginManifest(cacheDir);
  record.version = manifest.version ?? "unknown";
  writeInstalled(installed);
}

export function listPlugins(): InstalledPluginRecord[] {
  return Object.values(readInstalled());
}
