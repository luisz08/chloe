import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { getLogger } from "../logger/index.js";
import { extractDescription } from "../skills/loader.js";
import { readPluginManifest } from "./manifest.js";
import { readInstalled } from "./storage.js";
import type {
  HookEntry,
  HookEvent,
  InstalledPluginRecord,
  LoadedPlugin,
  PluginSkill,
} from "./types.js";

const VALID_COMMAND_NAME = /^[a-z0-9_-]+\.md$/;
const VALID_HOOK_EVENTS = new Set<string>([
  "SessionStart",
  "SessionEnd",
  "PreToolUse",
  "PostToolUse",
  "UserPromptSubmit",
]);

export async function loadInstalledPlugins(): Promise<LoadedPlugin[]> {
  const installed = readInstalled();
  const enabled = Object.values(installed).filter((r) => r.enabled);
  const results: LoadedPlugin[] = [];
  for (const record of enabled) {
    results.push(await loadPlugin(record));
  }
  return results;
}

export async function loadPlugin(record: InstalledPluginRecord): Promise<LoadedPlugin> {
  const log = getLogger("plugins");
  const manifest = readPluginManifest(record.cacheDir);

  const agentsDir = join(record.cacheDir, "agents");
  const mcpFile = join(record.cacheDir, ".mcp.json");
  if (existsSync(agentsDir) || existsSync(mcpFile)) {
    log.debug("not yet supported", { pluginId: record.id });
  }

  const skills = discoverSkills(record.cacheDir, record.id);
  const hooks = loadHooks(record.cacheDir, record.id);

  return { id: record.id, manifest, cacheDir: record.cacheDir, skills, hooks };
}

export function discoverSkills(cacheDir: string, pluginId: string): PluginSkill[] {
  const log = getLogger("plugins");
  const skills: PluginSkill[] = [];

  // Check skills/ directory: each subdir with a SKILL.md file
  const skillsDir = join(cacheDir, "skills");
  if (existsSync(skillsDir)) {
    for (const entry of readdirSync(skillsDir)) {
      const entryPath = join(skillsDir, entry);
      const skillFile = join(entryPath, "SKILL.md");
      try {
        if (statSync(entryPath).isDirectory() && existsSync(skillFile)) {
          const content = readFileSync(skillFile, "utf8");
          skills.push({
            name: entry,
            content,
            source: "plugin",
            description: extractDescription(content),
            pluginId,
          });
        }
      } catch (err) {
        log.warn("failed to load skill", {
          pluginId,
          entry,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  // Check commands/ directory: each <name>.md file matching pattern
  const commandsDir = join(cacheDir, "commands");
  if (existsSync(commandsDir)) {
    for (const file of readdirSync(commandsDir)) {
      if (!VALID_COMMAND_NAME.test(file)) continue;
      const name = file.slice(0, -3);
      try {
        const content = readFileSync(join(commandsDir, file), "utf8");
        skills.push({
          name,
          content,
          source: "plugin",
          description: extractDescription(content),
          pluginId,
        });
      } catch (err) {
        log.warn("failed to load command skill", {
          pluginId,
          file,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  return skills;
}

interface RawHookInner {
  type: string;
  command: string;
}

interface RawHookGroup {
  matcher?: string;
  hooks: RawHookInner[];
}

interface RawHooksFile {
  hooks: Record<string, RawHookGroup[]>;
}

export function loadHooks(cacheDir: string, pluginId: string): HookEntry[] {
  const hooksFile = join(cacheDir, "hooks", "hooks.json");
  if (!existsSync(hooksFile)) return [];

  const hooksLog = getLogger("plugins");
  let parsed: RawHooksFile;
  try {
    parsed = JSON.parse(readFileSync(hooksFile, "utf8")) as RawHooksFile;
  } catch (err) {
    hooksLog.warn("failed to parse hooks.json", {
      pluginId,
      file: hooksFile,
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }

  if (typeof parsed !== "object" || parsed === null || typeof parsed.hooks !== "object") {
    hooksLog.warn("invalid hooks.json structure", { pluginId, file: hooksFile });
    return [];
  }

  const entries: HookEntry[] = [];
  const log = getLogger("plugins");
  for (const [eventKey, groups] of Object.entries(parsed.hooks)) {
    if (!Array.isArray(groups)) continue;
    if (!VALID_HOOK_EVENTS.has(eventKey)) {
      log.warn("unknown hook event, skipping", { event: eventKey, pluginId });
      continue;
    }
    const event = eventKey as HookEvent;
    for (const group of groups) {
      if (!Array.isArray(group.hooks)) continue;
      for (const hook of group.hooks) {
        if (hook.type !== "command") continue;
        const entry: HookEntry = {
          event,
          type: "command",
          command: hook.command,
          pluginId,
        };
        if (group.matcher !== undefined) {
          entry.matcher = group.matcher;
        }
        entries.push(entry);
      }
    }
  }

  return entries;
}
