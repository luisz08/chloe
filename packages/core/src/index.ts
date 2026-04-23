// Config
export {
  CONFIG_PATH,
  expandHome,
  loadConfig,
  maskSecret,
  readFileConfig,
  setConfigInFile,
  writeConfig,
} from "./config.js";
export type {
  ChloeConfig,
  ContextCompressionConfig,
  LoggingConfig,
  ProviderConfig,
  RawFileConfig,
  StorageConfig,
} from "./config.js";

// Logger
export { getLogger, initLogger } from "./logger/index.js";
export type { LogLevel, Logger, LogSink } from "./logger/index.js";

// Agent
export { Agent, createAgent } from "./agent/agent.js";
export { compressIfNeeded, ContextTooLargeError } from "./agent/compressor.js";
export type { CompressResult, CompressorOptions } from "./agent/compressor.js";
export { getContextLimit } from "./agent/models.js";
export { resolveModelConfig } from "./agent/router.js";
export type {
  AgentCallbacks,
  AgentConfig,
  CompressionInfo,
  ResolvedModelConfig,
  RunResult,
  TurnUsage,
} from "./agent/types.js";

// Storage
export type { StorageAdapter } from "./storage/adapter.js";
export { SQLiteStorageAdapter } from "./storage/sqlite.js";

// Session
export type {
  Message,
  Session,
  SessionSummary,
  SessionTree,
  SubagentRequestContent,
  SubagentResponseContent,
} from "./session/types.js";
export {
  slugify,
  validateSessionId,
} from "./session/slug.js";
export { generateSessionId } from "./session/id.js";
export { formatSessionName } from "./session/name.js";
export {
  isSubagentRequestContent,
  isSubagentResponseContent,
} from "./session/types.js";

// Tools
export { ToolRegistry } from "./tools/registry.js";
export type { Tool } from "./tools/types.js";
export { createDefaultTools, loadToolSettings } from "./tools/index.js";
export type { ToolSettings } from "./tools/index.js";

// Skills
export {
  addRecent,
  expandArguments,
  loadRecents,
  loadSkills,
  mergePluginSkills,
  routeCommand,
  saveRecents,
} from "./skills/index.js";
export type { CommandResult, RouterOptions, Skill, SkillSource } from "./skills/index.js";

// Plugins
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
} from "./plugins/index.js";
export {
  discoverSkills,
  HookRegistry,
  loadHooks,
  loadInstalledPlugins,
  loadPlugin,
  marketplaceCloneDir,
  pluginCacheDir,
  readInstalled,
  readMarketplaceManifest,
  readMarketplaces,
  readPluginManifest,
  validateMarketplaceManifest,
  writeInstalled,
  writeMarketplaces,
} from "./plugins/index.js";
