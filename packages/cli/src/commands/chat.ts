import { homedir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { EchoTool, SQLiteStorageAdapter, createAgent, slugify } from "@chloe/core";
import { confirm } from "../ui/confirm.js";
import { printLine, printToken } from "../ui/stream.js";

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

  const dbPath = process.env.CHLOE_DB_PATH ?? join(homedir(), ".chloe", "chloe.db");
  const storage = new SQLiteStorageAdapter(dbPath);

  const model = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";
  const apiKey = process.env.ANTHROPIC_API_KEY ?? "";

  const agent = createAgent({
    model,
    apiKey,
    tools: [EchoTool],
    storage,
  });

  printLine(`[chloe] session: ${session}`);

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: "> ",
  });

  rl.prompt();

  await new Promise<void>((resolve) => {
    rl.on("line", async (line) => {
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

      await agent.run(sessionId, input, {
        onToken: (text) => printToken(text),
        confirmTool: yes ? undefined : (toolName, toolInput) => confirm(toolName, toolInput),
      });

      printLine("");
      rl.resume();
      rl.prompt();
    });

    rl.on("close", () => {
      resolve();
    });

    rl.on("SIGINT", () => {
      rl.close();
    });
  });
}
