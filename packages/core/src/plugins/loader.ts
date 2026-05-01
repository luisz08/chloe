import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { getLogger } from "../logger/index.js";
import { extractDescription } from "../skills/loader.js";
import { readPluginManifest } from "./manifest.js";
import { readInstalled } from "./storage.js";
import type { PluginManifest } from "./types.js";
import {
  type HookEntry,
  HookEntryType,
  HookEvent,
  type InstalledPluginRecord,
  type LoadedPlugin,
  type PluginSkill,
  SkillSource,
} from "./types.js";

const VALID_COMMAND_NAME = /^[a-z0-9_-]+$/;
const VALID_HOOK_EVENTS = new Set<string>(Object.values(HookEvent));

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

  const skills = discoverSkills(record.cacheDir, record.id, manifest);
  const hooks = loadHooks(record.cacheDir, record.id);

  return { id: record.id, manifest, cacheDir: record.cacheDir, skills, hooks };
}

export function discoverSkills(
  cacheDir: string,
  pluginId: string,
  manifest?: PluginManifest,
): PluginSkill[] {
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
            source: SkillSource.Plugin,
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

  // Check commands/ directory: each <name>/SKILL.md subdirectory
  const commandsDir = join(cacheDir, "commands");
  if (existsSync(commandsDir)) {
    for (const entry of readdirSync(commandsDir)) {
      if (!VALID_COMMAND_NAME.test(entry)) continue;
      const entryPath = join(commandsDir, entry);
      const skillFile = join(entryPath, "SKILL.md");
      try {
        if (!statSync(entryPath).isDirectory() || !existsSync(skillFile)) continue;
        const content = readFileSync(skillFile, "utf8");
        skills.push({
          name: entry,
          content,
          source: SkillSource.Plugin,
          description: extractDescription(content),
          pluginId,
        });
      } catch (err) {
        log.warn("failed to load command skill", {
          pluginId,
          entry,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  // Manifest-declared skills: "skills": "./" or ["path1", "path2"]
  if (manifest?.skills) {
    const declaredPaths = [manifest.skills].flat();
    const discoveredNames = new Set(skills.map((s) => s.name));
    for (const relPath of declaredPaths) {
      const skillDir = join(cacheDir, relPath);
      const skillFile = join(skillDir, "SKILL.md");
      if (!existsSync(skillFile)) continue;
      const name = manifest.name;
      if (discoveredNames.has(name)) continue;
      try {
        const content = readFileSync(skillFile, "utf8");
        skills.push({
          name,
          content,
          source: SkillSource.Plugin,
          description: extractDescription(content),
          pluginId,
        });
        discoveredNames.add(name);
      } catch (err) {
        log.warn("failed to load manifest-declared skill", {
          pluginId,
          path: skillFile,
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
        if (hook.type !== HookEntryType.Command) continue;
        const entry: HookEntry = {
          event,
          type: HookEntryType.Command,
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
