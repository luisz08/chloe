import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { Skill, SkillSource } from "./types.js";

const VALID_SKILL_NAME = /^[a-z0-9_-]+\.md$/;

function loadSkillsFromDir(dir: string, source: SkillSource): Skill[] {
  if (!existsSync(dir)) return [];

  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }

  const skills: Skill[] = [];
  for (const entry of entries) {
    if (!VALID_SKILL_NAME.test(entry)) continue;
    const name = entry.slice(0, -3); // strip .md
    let content: string;
    try {
      content = readFileSync(join(dir, entry), "utf8");
    } catch {
      continue;
    }
    skills.push({ name, content, source });
  }
  return skills;
}

/**
 * Load all skills from global and project directories.
 * Project-level skills override global skills with the same name.
 * Returns a map from skill name to Skill.
 */
export function loadSkills(globalDir: string, projectDir: string): Map<string, Skill> {
  const globalSkills = loadSkillsFromDir(globalDir, "global");
  const projectSkills = loadSkillsFromDir(projectDir, "project");

  const map = new Map<string, Skill>();
  for (const skill of globalSkills) {
    map.set(skill.name, skill);
  }
  for (const skill of projectSkills) {
    map.set(skill.name, skill);
  }
  return map;
}

/**
 * Replace all occurrences of $ARGUMENTS in content with the given arguments string.
 */
export function expandArguments(content: string, args: string): string {
  return content.replaceAll("$ARGUMENTS", args);
}
