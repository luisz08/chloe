import {
  EchoTool,
  SQLiteStorageAdapter,
  createAgent,
  getLogger,
  initLogger,
  loadConfig,
} from "@chloe/core";
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

const cfg = loadConfig();
initLogger(cfg.logging);
const log = getLogger("api");

if (!cfg.provider.apiKey) {
  console.error("Error: no API key configured. Run `chloe config init` or set CHLOE_API_KEY.");
  process.exit(1);
}

const storage = new SQLiteStorageAdapter(cfg.storage.dbPath);
const agent = createAgent({
  model: cfg.provider.model,
  apiKey: cfg.provider.apiKey,
  ...(cfg.provider.baseUrl ? { baseURL: cfg.provider.baseUrl } : {}),
  tools: [EchoTool],
  storage,
});

const port = resolvePort();
const router = createRouter(storage, agent);

Bun.serve({
  port,
  fetch: router,
});

log.info("server started", { port });
log.debug("config loaded", {
  provider: cfg.provider.name,
  db_path: cfg.storage.dbPath,
  log_dir: cfg.logging.logDir,
});
