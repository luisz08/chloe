import { SkillSource } from "../skills/types.js";
export { SkillSource };

export const MarketplaceSourceType = {
  Github: "github",
  Local: "local",
} as const;

export type MarketplaceSource =
  | { type: typeof MarketplaceSourceType.Github; repo: string; ref?: string }
  | { type: typeof MarketplaceSourceType.Local; path: string };

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
  source: typeof SkillSource.Plugin;
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

export const HookEvent = {
  SessionStart: "SessionStart",
  SessionEnd: "SessionEnd",
  PreToolUse: "PreToolUse",
  PostToolUse: "PostToolUse",
  UserPromptSubmit: "UserPromptSubmit",
} as const;
export type HookEvent = (typeof HookEvent)[keyof typeof HookEvent];

export const HookEntryType = {
  Command: "command",
} as const;

export interface HookEntry {
  event: HookEvent;
  matcher?: string;
  type: typeof HookEntryType.Command;
  command: string;
  pluginId: string;
}

export interface HookContext {
  event: HookEvent;
  toolName?: string;
  sessionId: string;
  pluginRoot: string;
}
