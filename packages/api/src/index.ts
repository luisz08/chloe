import { homedir } from "node:os";
import { join } from "node:path";
import { EchoTool, SQLiteStorageAdapter, createAgent } from "@chloe/core";
import { createRouter } from "./router.js";

// Resolve port: --port flag > PORT env var > 3000
function resolvePort(): number {
  const argIndex = process.argv.indexOf("--port");
  const portArg = argIndex !== -1 ? process.argv[argIndex + 1] : undefined;
  if (portArg) {
    const parsed = Number.parseInt(portArg, 10);
    if (!Number.isNaN(parsed)) return parsed;
  }
  if (process.env.PORT) {
    const parsed = Number.parseInt(process.env.PORT, 10);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return 3000;
}

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  console.error("Error: ANTHROPIC_API_KEY environment variable is required");
  process.exit(1);
}

const model = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";
const dbPath = process.env.CHLOE_DB_PATH ?? join(homedir(), ".chloe", "chloe.db");

const storage = new SQLiteStorageAdapter(dbPath);
const agent = createAgent({
  model,
  apiKey,
  tools: [EchoTool],
  storage,
});

const port = resolvePort();
const router = createRouter(storage, agent);

Bun.serve({
  port,
  fetch: router,
});

console.log(`Chloe API listening on http://localhost:${port}`);
