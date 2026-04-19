import { expandArguments, loadSkills } from "./loader.js";
import type { CommandResult, RouterOptions } from "./types.js";

/**
 * Route a user input string through the command/skill pipeline.
 *
 * - Non-/ input: passthrough
 * - /help: internal command
 * - /skill-name [args]: skill expansion
 * - /unknown: error
 */
export async function routeCommand(input: string, opts: RouterOptions): Promise<CommandResult> {
  if (!input.startsWith("/")) {
    return { kind: "passthrough" };
  }

  const withoutSlash = input.slice(1);
  const spaceIdx = withoutSlash.indexOf(" ");
  const commandName = spaceIdx === -1 ? withoutSlash : withoutSlash.slice(0, spaceIdx);
  const args = spaceIdx === -1 ? "" : withoutSlash.slice(spaceIdx + 1).trim();

  if (commandName === "") {
    return { kind: "error", message: "Unknown command: /" };
  }

  const normalizedName = commandName.toLowerCase();

  // Internal commands
  if (normalizedName === "help") {
    const skills = loadSkills(opts.globalSkillsDir, opts.projectSkillsDir);
    return { kind: "internal", output: buildHelpOutput(skills) };
  }

  // Skill lookup
  const skills = loadSkills(opts.globalSkillsDir, opts.projectSkillsDir);
  const skill = skills.get(normalizedName);

  if (skill === undefined) {
    return { kind: "error", message: `Unknown command: /${commandName}` };
  }

  if (skill.content.trim() === "") {
    return { kind: "error", message: `Skill '${normalizedName}' is empty` };
  }

  const expandedContent = expandArguments(skill.content, args);
  return { kind: "skill", expandedContent };
}

function buildHelpOutput(skills: Map<string, import("./types.js").Skill>): string {
  const lines: string[] = [];
  lines.push("Available commands:");
  lines.push("  /help  — List all commands and skills");

  if (skills.size === 0) {
    lines.push("");
    lines.push("No skills defined.");
  } else {
    lines.push("");
    lines.push("Skills:");

    for (const [name, skill] of [...skills.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      lines.push(`  /${name}  [${skill.source}]`);
    }
  }

  return lines.join("\n");
}
