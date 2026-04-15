import type { AgentCallbacks } from "@chloe/core";
import {
  SQLiteStorageAdapter,
  createAgent,
  getLogger,
  initLogger,
  loadConfig,
  slugify,
} from "@chloe/core";
import { render } from "ink";
import React from "react";
import type { AgentHandle } from "../agent-handle.js";
import { App } from "../ui/App.js";

interface ChatCommandOptions {
  session: string;
  yes: boolean;
}

export async function chatCommand({ session, yes }: ChatCommandOptions): Promise<void> {
  const sessionId = slugify(session);
  if (sessionId === null) {
    console.error(`Error: invalid session name: '${session}'`);
    process.exit(1);
  }

  const cfg = loadConfig();
  initLogger(cfg.logging);
  const log = getLogger("cli");

  if (!cfg.provider.apiKey) {
    console.error("Error: no API key configured. Run `chloe config init` or set CHLOE_API_KEY.");
    process.exit(1);
  }

  // Check minimum Bun version for Bun.markdown.ansi()
  const bunVersion = typeof Bun !== "undefined" ? Bun.version : "0.0.0";
  const [majorStr, minorStr, patchStr] = bunVersion.split(".");
  const major = Number(majorStr ?? "0");
  const minor = Number(minorStr ?? "0");
  const patch = Number(patchStr ?? "0");
  if (major < 1 || (major === 1 && minor < 3) || (major === 1 && minor === 3 && patch < 12)) {
    console.warn(
      `Warning: Bun ≥ 1.3.12 recommended for Markdown rendering (current: ${bunVersion})`,
    );
  }

  log.debug("config loaded", {
    provider: cfg.provider.name,
    db_path: cfg.storage.dbPath,
    log_dir: cfg.logging.logDir,
  });

  const storage = new SQLiteStorageAdapter(cfg.storage.dbPath);

  const coreAgent = createAgent({
    model: cfg.provider.model,
    apiKey: cfg.provider.apiKey,
    ...(cfg.provider.baseUrl ? { baseURL: cfg.provider.baseUrl } : {}),
    storage,
  });

  const agent: AgentHandle = {
    run(sid: string, message: string, callbacks: AgentCallbacks): Promise<void> {
      return coreAgent.run(sid, message, callbacks).then(() => undefined);
    },
  };

  const { waitUntilExit } = render(
    React.createElement(App, {
      sessionId,
      modelName: cfg.provider.model,
      autoConfirm: yes,
      agent,
    }),
    { exitOnCtrlC: false },
  );

  await waitUntilExit();
}
