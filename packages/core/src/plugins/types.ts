export type MarketplaceSource =
  | { type: "github"; repo: string; ref?: string }
  | { type: "local"; path: string };

export type PluginSourceSpec = string | { source: "github"; repo: string; ref?: string };

export interface MarketplaceRecord {
  name: string;
  addedAt: string;
  source: MarketplaceSource;
  cloneDir: string | null;
}

export interface MarketplaceManifest {
  name: string;
  owner: { name: string; email?: string };
  metadata?: { description?: string };
  plugins: MarketplacePluginEntry[];
}

export interface MarketplacePluginEntry {
  name: string;
  source: PluginSourceSpec;
  description?: string;
  version?: string;
}

export interface PluginManifest {
  name: string;
  version?: string;
  description?: string;
  author?: { name: string; email?: string };
  skills?: string | string[];
  commands?: string | string[];
  agents?: string | string[];
  hooks?: string;
}

export interface InstalledPluginRecord {
  id: string;
  name: string;
  marketplace: string;
  version: string;
  enabled: boolean;
  cacheDir: string;
  installedAt: string;
}

export interface PluginSkill {
  name: string;
  content: string;
  source: "plugin";
  description: string;
  pluginId: string;
}

export interface LoadedPlugin {
  id: string;
  manifest: PluginManifest;
  cacheDir: string;
  skills: PluginSkill[];
  hooks: HookEntry[];
}

export type HookEvent =
  | "SessionStart"
  | "SessionEnd"
  | "PreToolUse"
  | "PostToolUse"
  | "UserPromptSubmit";

export interface HookEntry {
  event: HookEvent;
  matcher?: string;
  type: "command";
  command: string;
  pluginId: string;
}

export interface HookContext {
  event: HookEvent;
  toolName?: string;
  sessionId: string;
  pluginRoot: string;
}
