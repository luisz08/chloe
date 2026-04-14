import { chatCommand } from "./commands/chat.js";
import { serveCommand } from "./commands/serve.js";
import { sessionsCommand } from "./commands/sessions.js";

function parseArgs(): void {
  const args = process.argv.slice(2);
  const subcommand = args[0];

  if (subcommand === "sessions") {
    const sessionsSubcommand = args[1];

    if (sessionsSubcommand === "list") {
      sessionsCommand({ subcommand: "list" }).catch((err) => {
        console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      });
      return;
    }

    if (sessionsSubcommand === "delete") {
      const id = args[2];
      if (!id) {
        console.error("Error: session id required");
        process.exit(1);
      }
      sessionsCommand({ subcommand: "delete", id }).catch((err) => {
        console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      });
      return;
    }

    console.error(`Error: unknown sessions subcommand: '${sessionsSubcommand ?? ""}'`);
    process.exit(1);
  }

  if (!process.env.CHLOE_API_KEY) {
    console.error("Error: CHLOE_API_KEY is not set");
    process.exit(1);
  }

  if (subcommand === "chat") {
    let session: string | undefined;
    let yes = false;

    for (let i = 1; i < args.length; i++) {
      if (args[i] === "--session" && args[i + 1]) {
        session = args[i + 1];
        i++;
      } else if (args[i] === "--yes" || args[i] === "-y") {
        yes = true;
      }
    }

    if (!session) {
      console.error("Error: --session <name> is required for chat");
      process.exit(1);
    }

    chatCommand({ session, yes }).catch((err) => {
      console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    });
    return;
  }

  if (subcommand === "serve") {
    let port: number | undefined;
    const portIndex = args.indexOf("--port");
    if (portIndex !== -1 && args[portIndex + 1]) {
      const parsed = Number.parseInt(args[portIndex + 1] ?? "", 10);
      if (!Number.isNaN(parsed)) port = parsed;
    }
    serveCommand({ port });
    return;
  }

  if (!subcommand) {
    console.error("Error: subcommand required (chat, sessions, serve)");
    process.exit(1);
  }

  console.error(`Error: unknown subcommand: '${subcommand}'`);
  process.exit(1);
}

parseArgs();
