import {
  addMarketplace,
  disablePlugin,
  enablePlugin,
  getMarketplacePlugins,
  installPlugin,
  listMarketplaces,
  listPlugins,
  removeMarketplace,
  uninstallPlugin,
  updateMarketplace,
  updatePlugin,
} from "@chloe/core/plugins";

function parseSpec(spec: string): { name: string; marketplace: string } {
  const atIdx = spec.lastIndexOf("@");
  if (atIdx === -1) {
    throw new Error(`Invalid plugin spec (expected name@marketplace): ${spec}`);
  }
  return { name: spec.slice(0, atIdx), marketplace: spec.slice(atIdx + 1) };
}

async function cmdMarketplace(args: string[]): Promise<void> {
  const sub = args[0];

  if (sub === "add") {
    const fromDirIdx = args.indexOf("--from-dir");
    if (fromDirIdx !== -1) {
      const dir = args[fromDirIdx + 1];
      if (!dir) {
        console.error("Error: --from-dir requires a path argument");
        process.exit(1);
      }
      const name = await addMarketplace("", dir);
      console.log(`Marketplace added: ${name}`);
      return;
    }
    const source = args[1];
    if (!source) {
      console.error("Usage: chloe plugin marketplace add <owner/repo>");
      console.error("       chloe plugin marketplace add --from-dir <path>");
      process.exit(1);
    }
    const name = await addMarketplace(source);
    console.log(`Marketplace added: ${name}`);
    return;
  }

  if (sub === "list") {
    const list = listMarketplaces();
    if (list.length === 0) {
      console.log("No marketplaces registered.");
      return;
    }
    const nameW = Math.max(4, ...list.map((m) => m.name.length));
    const srcW = Math.max(
      6,
      ...list.map((m) =>
        m.source.type === "github"
          ? `github:${m.source.repo}`.length
          : `local:${m.source.path}`.length,
      ),
    );
    console.log(`${"Name".padEnd(nameW)}  ${"Source".padEnd(srcW)}  Plugins`);
    console.log(`${"-".repeat(nameW)}  ${"-".repeat(srcW)}  -------`);
    for (const m of list) {
      const src = m.source.type === "github" ? `github:${m.source.repo}` : `local:${m.source.path}`;
      let count = 0;
      try {
        count = getMarketplacePlugins(m.name).length;
      } catch {
        count = 0;
      }
      console.log(`${m.name.padEnd(nameW)}  ${src.padEnd(srcW)}  ${count}`);
    }
    return;
  }

  if (sub === "remove") {
    const name = args[1];
    if (!name) {
      console.error("Usage: chloe plugin marketplace remove <name>");
      process.exit(1);
    }
    await removeMarketplace(name);
    console.log(`Marketplace removed: ${name}`);
    return;
  }

  if (sub === "update") {
    await updateMarketplace(args[1]);
    console.log(args[1] ? `Marketplace updated: ${args[1]}` : "All marketplaces updated.");
    return;
  }

  console.error(`Error: unknown marketplace subcommand: '${sub ?? ""}'`);
  console.error("Usage: chloe plugin marketplace <add|list|remove|update>");
  process.exit(1);
}

export async function pluginCommand(args: string[]): Promise<void> {
  const sub = args[0];

  if (sub === "marketplace") {
    await cmdMarketplace(args.slice(1));
    return;
  }

  if (sub === "install") {
    const spec = args[1];
    if (!spec) {
      console.error("Usage: chloe plugin install <name@marketplace>");
      process.exit(1);
    }
    const { name, marketplace } = parseSpec(spec);
    await installPlugin(name, marketplace);
    console.log(`Installed: ${spec}`);
    return;
  }

  if (sub === "uninstall") {
    const spec = args[1];
    if (!spec) {
      console.error("Usage: chloe plugin uninstall <name@marketplace>");
      process.exit(1);
    }
    const { name, marketplace } = parseSpec(spec);
    const id = `${name}@${marketplace}`;
    uninstallPlugin(id);
    console.log(`Uninstalled: ${spec}`);
    return;
  }

  if (sub === "list") {
    const plugins = listPlugins();
    if (plugins.length === 0) {
      console.log("No plugins installed.");
      return;
    }
    const nameW = Math.max(4, ...plugins.map((p) => p.name.length));
    const mktW = Math.max(11, ...plugins.map((p) => p.marketplace.length));
    const verW = Math.max(7, ...plugins.map((p) => p.version.length));
    console.log(
      `${"Name".padEnd(nameW)}  ${"Marketplace".padEnd(mktW)}  ${"Version".padEnd(verW)}  Status`,
    );
    console.log(`${"-".repeat(nameW)}  ${"-".repeat(mktW)}  ${"-".repeat(verW)}  ------`);
    for (const p of plugins) {
      const status = p.enabled ? "enabled" : "disabled";
      console.log(
        `${p.name.padEnd(nameW)}  ${p.marketplace.padEnd(mktW)}  ${p.version.padEnd(verW)}  ${status}`,
      );
    }
    return;
  }

  if (sub === "enable") {
    const spec = args[1];
    if (!spec) {
      console.error("Usage: chloe plugin enable <name@marketplace>");
      process.exit(1);
    }
    const { name, marketplace } = parseSpec(spec);
    enablePlugin(`${name}@${marketplace}`);
    console.log(`Enabled: ${spec}`);
    return;
  }

  if (sub === "disable") {
    const spec = args[1];
    if (!spec) {
      console.error("Usage: chloe plugin disable <name@marketplace>");
      process.exit(1);
    }
    const { name, marketplace } = parseSpec(spec);
    disablePlugin(`${name}@${marketplace}`);
    console.log(`Disabled: ${spec}`);
    return;
  }

  if (sub === "update") {
    const spec = args[1];
    if (!spec) {
      console.error("Usage: chloe plugin update <name@marketplace>");
      process.exit(1);
    }
    const { name, marketplace } = parseSpec(spec);
    await updatePlugin(`${name}@${marketplace}`);
    console.log(`Updated: ${spec}`);
    return;
  }

  // Help / unknown
  console.log(
    [
      "Usage: chloe plugin <subcommand>",
      "",
      "Marketplace subcommands:",
      "  marketplace add <owner/repo>",
      "  marketplace add --from-dir <path>",
      "  marketplace list",
      "  marketplace remove <name>",
      "  marketplace update [name]",
      "",
      "Plugin subcommands:",
      "  install <name@marketplace>",
      "  uninstall <name@marketplace>",
      "  list",
      "  enable <name@marketplace>",
      "  disable <name@marketplace>",
      "  update <name@marketplace>",
    ].join("\n"),
  );

  if (sub !== undefined) {
    console.error(`\nError: unknown plugin subcommand: '${sub}'`);
    process.exit(1);
  }
}
