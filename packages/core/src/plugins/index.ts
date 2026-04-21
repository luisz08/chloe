export type {
  HookContext,
  HookEntry,
  HookEvent,
  InstalledPluginRecord,
  LoadedPlugin,
  MarketplaceManifest,
  MarketplacePluginEntry,
  MarketplaceRecord,
  MarketplaceSource,
  PluginManifest,
  PluginSkill,
  PluginSourceSpec,
} from "./types.js";

export {
  marketplaceCloneDir,
  pluginCacheDir,
  readInstalled,
  readMarketplaces,
  writeInstalled,
  writeMarketplaces,
} from "./storage.js";

export {
  readMarketplaceManifest,
  readPluginManifest,
  validateMarketplaceManifest,
} from "./manifest.js";

export { discoverSkills, loadHooks, loadInstalledPlugins, loadPlugin } from "./loader.js";

export { HookRegistry } from "./hooks.js";

export {
  addMarketplace,
  getMarketplacePlugins,
  listMarketplaces,
  removeMarketplace,
  updateMarketplace,
} from "./marketplace.js";

export {
  disablePlugin,
  enablePlugin,
  installPlugin,
  listPlugins,
  uninstallPlugin,
  updatePlugin,
} from "./installer.js";
