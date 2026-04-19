import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { Skill, SkillSource } from "./types.js";

const VALID_SKILL_NAME = /^[a-z0-9_-]+\.md$/;

function loadSkillsFromDir(dir: string, source: SkillSource): Map<string, Skill> {
  const skills = new Map<string, Skill>();
  if (!existsSync(dir)) return skills;
  for (const file of readdirSync(dir)) {
    if (!VALID_SKILL_NAME.test(file)) continue;
    const name = file.slice(0, -3);
    const content = readFileSync(join(dir, file), "utf8");
    skills.set(name, { name, content, source });
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
