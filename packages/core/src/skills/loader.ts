import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { PluginSkill } from "../plugins/types.js";
import type { Skill, SkillSource } from "./types.js";

const VALID_SKILL_NAME = /^[a-z0-9_-]+\.md$/;

export function extractDescription(content: string): string {
  const lines = content.split("\n");
  if (lines[0]?.trim() === "---") {
    for (let i = 1; i < lines.length; i++) {
      if (lines[i]?.trim() === "---") {
        // Past frontmatter — find first non-empty line
        for (let j = i + 1; j < lines.length; j++) {
          if (lines[j]?.trim()) return lines[j]?.trim() ?? "(no description)";
        }
        return "(no description)";
      }
      const match = lines[i]?.match(/^description:\s*(.+)$/);
      if (match) return match[1]?.trim() ?? "(no description)";
    }
    return "(no description)";
  }
  for (const line of lines) {
    if (line.trim()) return line.trim();
  }
  return "(no description)";
}

function loadSkillsFromDir(dir: string, source: SkillSource): Map<string, Skill> {
  const skills = new Map<string, Skill>();
  if (!existsSync(dir)) return skills;
  for (const file of readdirSync(dir)) {
    if (!VALID_SKILL_NAME.test(file)) continue;
    const name = file.slice(0, -3);
    const content = readFileSync(join(dir, file), "utf8");
    skills.set(name, { name, content, source, description: extractDescription(content) });
  }
  return skills;
}

export async function loadSkills(globalDir: string, projectDir: string): Promise<Skill[]> {
  const global = loadSkillsFromDir(globalDir, "global");
  const project = loadSkillsFromDir(projectDir, "project");
  const merged = new Map([...global, ...project]);
  return [...merged.values()];
}

export function expandArguments(content: string, args: string): string {
  return content.replaceAll("$ARGUMENTS", args.trim());
}

export function mergePluginSkills(existing: Skill[], pluginSkills: PluginSkill[]): Skill[] {
  // Plugin skills are lowest priority: project > global > plugin
  const pluginMap = new Map(
    pluginSkills.map((s) => [
      s.name,
      { name: s.name, content: s.content, source: "plugin" as const, description: s.description },
    ]),
  );
  const existingMap = new Map(existing.map((s) => [s.name, s]));
  return [...new Map([...pluginMap, ...existingMap]).values()];
}
