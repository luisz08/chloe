import {
  disablePlugin,
  enablePlugin,
  installPlugin,
  listPlugins,
  uninstallPlugin,
  updatePlugin,
} from "../plugins/installer.js";
import { loadInstalledPlugins } from "../plugins/loader.js";
import {
  addMarketplace,
  listMarketplaces,
  removeMarketplace,
  updateMarketplace,
} from "../plugins/marketplace.js";
import { MarketplaceSourceType } from "../plugins/types.js";
import { expandArguments, loadSkills, mergePluginSkills } from "./loader.js";
import type { CommandResult } from "./types.js";

export interface RouterOptions {
  globalSkillsDir: string;
  projectSkillsDir: string;
}

function skillLine(name: string, description: string, tag?: string): string {
  const desc = description || "(no description)";
  const suffix = tag ? ` *(${tag})*` : "";
  return `- \`/${name}\` : ${desc}${suffix}`;
}

async function buildHelpOutput(opts: RouterOptions): Promise<string> {
  const sections: string[] = [];

  sections.push("**Available commands:**");
  sections.push("- `/help` : Show this help message");
  sections.push("- `/reload-skills` : Reload skills from disk");

  const globalSkills = await loadSkills(opts.globalSkillsDir, "");
  const projectSkills = await loadSkills("", opts.projectSkillsDir);
  const globalNames = new Set(globalSkills.map((s) => s.name));

  if (globalSkills.length > 0) {
    sections.push("\n**Skills (global):**");
    for (const s of globalSkills) {
      sections.push(skillLine(s.name, s.description));
    }
  }

  if (projectSkills.length > 0) {
    sections.push("\n**Skills (project):**");
    for (const s of projectSkills) {
      const tag = globalNames.has(s.name) ? "overrides global" : undefined;
      sections.push(skillLine(s.name, s.description, tag));
    }
  }

  const plugins = await loadInstalledPlugins();
  const pluginSkills = plugins.flatMap((p) => p.skills);
  if (pluginSkills.length > 0) {
    sections.push("\n**Skills (plugins):**");
    for (const s of pluginSkills) {
      sections.push(skillLine(s.name, s.description, s.pluginId));
    }
  }

  const hasSkills = globalSkills.length > 0 || projectSkills.length > 0 || pluginSkills.length > 0;
  if (!hasSkills) {
    sections.push("\nNo skills defined");
  }

  sections.push("\n**Plugin management:**");
  sections.push("- `/plugin list` : List installed plugins");
  sections.push("- `/plugin install <name@marketplace>` : Install a plugin");
  sections.push("- `/plugin uninstall <name@marketplace>` : Remove a plugin");
  sections.push("- `/plugin enable <name@marketplace>` : Enable a plugin");
  sections.push("- `/plugin disable <name@marketplace>` : Disable a plugin");
  sections.push("- `/plugin update <name@marketplace>` : Update a plugin");
  sections.push("- `/plugin marketplace list` : List registered marketplaces");
  sections.push("- `/plugin marketplace add --from-dir <path>` : Add local marketplace");
  sections.push("- `/plugin marketplace add <owner/repo>` : Add GitHub marketplace");
  sections.push("- `/plugin marketplace remove <name>` : Remove a marketplace");
  sections.push("- `/plugin marketplace update [name]` : Update marketplace(s)");

  return sections.join("\n");
}

function parsePluginSpec(spec: string): { name: string; marketplace: string } {
  const atIdx = spec.lastIndexOf("@");
  if (atIdx === -1) {
    throw new Error(`Invalid plugin spec (expected name@marketplace): ${spec}`);
  }
  return {
    name: spec.slice(0, atIdx),
    marketplace: spec.slice(atIdx + 1),
  };
}

async function handlePluginSlashCommand(args: string): Promise<string> {
  const parts = args.trim().split(/\s+/);
  const sub = parts[0] ?? "";

  if (sub === "marketplace") {
    const mktSub = parts[1] ?? "";

    if (mktSub === "add") {
      const fromDirIdx = parts.indexOf("--from-dir");
      if (fromDirIdx !== -1 && parts[fromDirIdx + 1]) {
        const name = await addMarketplace("", parts[fromDirIdx + 1] as string);
        return `Marketplace added: ${name}`;
      }
      const source = parts[2];
      if (!source) {
        return "Usage: /plugin marketplace add <owner/repo>";
      }
      const name = await addMarketplace(source);
      return `Marketplace added: ${name}`;
    }

    if (mktSub === "list") {
      const list = listMarketplaces();
      if (list.length === 0) return "No marketplaces registered.";
      return list
        .map((m) => {
          const src =
            m.source.type === MarketplaceSourceType.Github ? m.source.repo : m.source.path;
          return `${m.name}  ${src}`;
        })
        .join("\n");
    }

    if (mktSub === "remove") {
      const mktName = parts[2];
      if (!mktName) {
        return "Usage: /plugin marketplace remove <name>";
      }
      await removeMarketplace(mktName);
      return `Marketplace removed: ${mktName}`;
    }

    if (mktSub === "update") {
      await updateMarketplace(parts[2]);
      return parts[2] ? `Marketplace updated: ${parts[2]}` : "All marketplaces updated.";
    }

    return `Unknown marketplace subcommand: ${mktSub}\nUsage: /plugin marketplace <add|list|remove|update>`;
  }

  if (sub === "install") {
    const spec = parts[1];
    if (!spec) return "Usage: /plugin install <name@marketplace>";
    const { name, marketplace } = parsePluginSpec(spec);
    await installPlugin(name, marketplace);
    return `Installed: ${spec}`;
  }

  if (sub === "uninstall") {
    const spec = parts[1];
    if (!spec) return "Usage: /plugin uninstall <name@marketplace>";
    const { name, marketplace } = parsePluginSpec(spec);
    uninstallPlugin(`${name}@${marketplace}`);
    return `Uninstalled: ${spec}`;
  }

  if (sub === "list") {
    const plugins = listPlugins();
    if (plugins.length === 0) return "No plugins installed.";
    return plugins
      .map((p) => {
        const status = p.enabled ? "enabled" : "disabled";
        return `${p.name}@${p.marketplace}  v${p.version}  ${status}`;
      })
      .join("\n");
  }

  if (sub === "enable") {
    const spec = parts[1];
    if (!spec) return "Usage: /plugin enable <name@marketplace>";
    const { name, marketplace } = parsePluginSpec(spec);
    enablePlugin(`${name}@${marketplace}`);
    return `Enabled: ${spec}`;
  }

  if (sub === "disable") {
    const spec = parts[1];
    if (!spec) return "Usage: /plugin disable <name@marketplace>";
    const { name, marketplace } = parsePluginSpec(spec);
    disablePlugin(`${name}@${marketplace}`);
    return `Disabled: ${spec}`;
  }

  if (sub === "update") {
    const spec = parts[1];
    if (!spec) return "Usage: /plugin update <name@marketplace>";
    const { name, marketplace } = parsePluginSpec(spec);
    await updatePlugin(`${name}@${marketplace}`);
    return `Updated: ${spec}`;
  }

  return `Unknown subcommand: ${sub}\nRun \`/help\` to see available plugin commands.`;
}

const INTERNAL_COMMANDS = new Set(["help", "reload-skills"]);

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

  if (name === "reload-skills") {
    return { kind: "reload-skills" };
  }

  if (name === "plugin") {
    return {
      kind: "internal",
      output: await handlePluginSlashCommand(args),
    };
  }

  if (INTERNAL_COMMANDS.has(name)) {
    return { kind: "internal", output: await buildHelpOutput(opts) };
  }

  const baseSkills = await loadSkills(opts.globalSkillsDir, opts.projectSkillsDir);
  const plugins = await loadInstalledPlugins();
  const skills = mergePluginSkills(
    baseSkills,
    plugins.flatMap((p) => p.skills),
  );
  const skill = skills.find((s) => s.name === name);

  if (!skill) {
    return { kind: "error", message: `Unknown command: /${rawName}` };
  }

  if (skill.content.trim() === "") {
    return { kind: "error", message: `Skill '${name}' is empty` };
  }

  return { kind: "skill", expandedContent: expandArguments(skill.content, args) };
}
