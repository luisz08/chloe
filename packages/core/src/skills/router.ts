import { expandArguments, loadSkills } from "./loader.js";
import type { CommandResult } from "./types.js";

export interface RouterOptions {
  globalSkillsDir: string;
  projectSkillsDir: string;
}

async function buildHelpOutput(opts: RouterOptions): Promise<string> {
  const lines: string[] = ["Available commands:", "  /help    Show this help message", ""];

  const globalSkills = await loadSkills(opts.globalSkillsDir, "");
  const projectSkills = await loadSkills("", opts.projectSkillsDir);
  const globalNames = new Set(globalSkills.map((s) => s.name));

  if (globalSkills.length > 0) {
    lines.push(`Skills (global: ${opts.globalSkillsDir}):`);
    for (const s of globalSkills) {
      lines.push(`  /${s.name}`);
    }
    lines.push("");
  }

  if (projectSkills.length > 0) {
    lines.push(`Skills (project: ${opts.projectSkillsDir}):`);
    for (const s of projectSkills) {
      const override = globalNames.has(s.name) ? "  [overrides global]" : "";
      lines.push(`  /${s.name}${override}`);
    }
    lines.push("");
  }

  if (globalSkills.length === 0 && projectSkills.length === 0) {
    lines.push("No skills defined.");
  }

  return lines.join("\n");
}

const INTERNAL_COMMANDS = new Set(["help"]);

export async function routeCommand(input: string, opts: RouterOptions): Promise<CommandResult> {
  if (!input.startsWith("/")) {
    return { kind: "passthrough" };
  }

  const withoutSlash = input.slice(1);
  const spaceIdx = withoutSlash.indexOf(" ");
  const rawName = spaceIdx === -1 ? withoutSlash : withoutSlash.slice(0, spaceIdx);
  const args = spaceIdx === -1 ? "" : withoutSlash.slice(spaceIdx + 1);
  const name = rawName.toLowerCase();

  if (name === "") {
    return { kind: "error", message: "Unknown command: /" };
  }

  if (INTERNAL_COMMANDS.has(name)) {
    return { kind: "internal", output: await buildHelpOutput(opts) };
  }

  const skills = await loadSkills(opts.globalSkillsDir, opts.projectSkillsDir);
  const skill = skills.find((s) => s.name === name);

  if (!skill) {
    return { kind: "error", message: `Unknown command: /${rawName}` };
  }

  if (skill.content.trim() === "") {
    return { kind: "error", message: `Skill '${name}' is empty` };
  }

  return { kind: "skill", expandedContent: expandArguments(skill.content, args) };
}
