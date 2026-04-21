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
import { expandArguments, loadSkills, mergePluginSkills } from "./loader.js";
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

const PLUGIN_HELP = [
  "Plugin commands:",
  "  /plugin marketplace add <owner/repo>",
  "  /plugin marketplace add --from-dir <path>",
  "  /plugin marketplace list",
  "  /plugin marketplace remove <name>",
  "  /plugin marketplace update [name]",
  "  /plugin install <name@marketplace>",
  "  /plugin uninstall <name@marketplace>",
  "  /plugin list",
  "  /plugin enable <name@marketplace>",
  "  /plugin disable <name@marketplace>",
  "  /plugin update <name@marketplace>",
].join("\n");

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
          const src = m.source.type === "github" ? m.source.repo : m.source.path;
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

  return PLUGIN_HELP;
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
