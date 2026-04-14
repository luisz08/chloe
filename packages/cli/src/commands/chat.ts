import { createInterface } from "node:readline";
import type { Interface as RLInterface } from "node:readline";
import type { AgentCallbacks } from "@chloe/core";
import {
  SQLiteStorageAdapter,
  createAgent,
  getLogger,
  initLogger,
  loadConfig,
  slugify,
} from "@chloe/core";
import { confirm } from "../ui/confirm.js";
import { printLine, printToken } from "../ui/stream.js";

interface ChatCommandOptions {
  session: string;
  yes: boolean;
}

// bun-types omits EventEmitter methods on readline.Interface; augment locally
type RLEvents = RLInterface & {
  on(event: "line", listener: (line: string) => void): void;
  on(event: "close", listener: () => void): void;
  on(event: "SIGINT", listener: () => void): void;
};

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

  log.debug("config loaded", {
    provider: cfg.provider.name,
    db_path: cfg.storage.dbPath,
    log_dir: cfg.logging.logDir,
  });

  const storage = new SQLiteStorageAdapter(cfg.storage.dbPath);

  const agent = createAgent({
    model: cfg.provider.model,
    apiKey: cfg.provider.apiKey,
    ...(cfg.provider.baseUrl ? { baseURL: cfg.provider.baseUrl } : {}),
    storage,
  });

  printLine(`[chloe] session: ${session}`);

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: "> ",
  }) as RLEvents;

  rl.prompt();

  await new Promise<void>((resolve) => {
    rl.on("line", (line: string) => {
      const input = line.trim();

      if (input === "exit") {
        rl.close();
        return;
      }

      if (input === "") {
        rl.prompt();
        return;
      }

      rl.pause();

      const callbacks: AgentCallbacks = {
        onToken: (text: string) => printToken(text),
        ...(yes ? {} : { confirmTool: (name: string, inp: unknown) => confirm(name, inp) }),
      };

      agent
        .run(sessionId, input, callbacks)
        .then(() => {
          printLine("");
          rl.resume();
          rl.prompt();
        })
        .catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : String(err);
          printLine(`\nError: ${msg}`);
          rl.resume();
          rl.prompt();
        });
    });

    rl.on("close", () => {
      resolve();
    });

    rl.on("SIGINT", () => {
      rl.close();
    });
  });
}
