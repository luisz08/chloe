import { existsSync } from "node:fs";
import { createInterface } from "node:readline";
import {
  CONFIG_PATH,
  type ChloeConfig,
  loadConfig,
  maskSecret,
  readFileConfig,
  setConfigInFile,
  writeConfig,
} from "@chloe/core";

// ─── Valid keys ───────────────────────────────────────────────────────────────

const VALID_KEYS = [
  "provider.api_key",
  "provider.name",
  "provider.default_model",
  "provider.reasoning_model",
  "provider.fast_model",
  "provider.vision_model",
  "provider.base_url",
  "storage.db_path",
] as const;

type ValidKey = (typeof VALID_KEYS)[number];

function isValidKey(key: string): key is ValidKey {
  return (VALID_KEYS as readonly string[]).includes(key);
}

function printKeyError(key: string): void {
  console.error(`Error: unknown config key '${key}'`);
  console.error(`Valid keys: ${VALID_KEYS.join(", ")}`);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function ask(prompt: string, defaultValue = ""): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const display = defaultValue ? `${prompt} [${defaultValue}]: ` : `${prompt}: `;
  return new Promise((resolve) => {
    rl.question(display, (answer) => {
      rl.close();
      resolve(answer.trim() || defaultValue);
    });
  });
}

function getEffectiveValue(key: ValidKey, cfg: ChloeConfig): string {
  switch (key) {
    case "provider.api_key":
      return cfg.provider.apiKey;
    case "provider.name":
      return cfg.provider.name;
    case "provider.default_model":
      return cfg.provider.defaultModel;
    case "provider.reasoning_model":
      return cfg.provider.reasoningModel;
    case "provider.fast_model":
      return cfg.provider.fastModel;
    case "provider.vision_model":
      return cfg.provider.visionModel;
    case "provider.base_url":
      return cfg.provider.baseUrl;
    case "storage.db_path":
      return cfg.storage.dbPath;
  }
}

const ENV_MAP: Record<ValidKey, string> = {
  "provider.api_key": "CHLOE_API_KEY",
  "provider.name": "CHLOE_PROVIDER",
  "provider.default_model": "CHLOE_DEFAULT_MODEL",
  "provider.reasoning_model": "CHLOE_REASONING_MODEL",
  "provider.fast_model": "CHLOE_FAST_MODEL",
  "provider.vision_model": "CHLOE_VISION_MODEL",
  "provider.base_url": "CHLOE_BASE_URL",
  "storage.db_path": "CHLOE_DB_PATH",
};

function sourceAnnotation(key: ValidKey): string {
  const envVar = ENV_MAP[key];
  if (process.env[envVar]) return `[from env: ${envVar}]`;

  const fileConfig = readFileConfig();
  if (fileConfig) {
    const [section, field] = key.split(".") as [string, string];
    const secObj = fileConfig[section as keyof typeof fileConfig] as Record<string, string>;
    if (secObj[field]) return "[from file]";
  }

  return "[default]";
}

// ─── Subcommands ─────────────────────────────────────────────────────────────

async function cmdInit(): Promise<void> {
  if (existsSync(CONFIG_PATH)) {
    const answer = await ask(`Config already exists at ${CONFIG_PATH}. Overwrite? [y/N]`);
    if (answer.toLowerCase() !== "y") {
      console.log("Cancelled.");
      return;
    }
  }

  const apiKey = await ask("API Key (required)");
  if (!apiKey) {
    console.error("Error: API key is required.");
    process.exit(1);
  }

  const defaultModel = await ask("Default Model", "claude-sonnet-4-6");
  const reasoningModel = await ask("Reasoning Model (optional, leave blank to use default)", "");
  const fastModel = await ask("Fast Model (optional, leave blank to use default)", "");
  const visionModel = await ask("Vision Model (optional, leave blank to use default)", "");
  const baseUrl = await ask("Base URL (optional, leave blank for default Anthropic endpoint)");

  const cfg: ChloeConfig = {
    provider: {
      apiKey,
      name: "anthropic",
      defaultModel,
      reasoningModel: reasoningModel || defaultModel,
      fastModel: fastModel || defaultModel,
      visionModel: visionModel || defaultModel,
      baseUrl,
    },
    storage: { dbPath: "" },
    logging: { logDir: "", level: "info", maxSizeMb: 10, maxDays: 7 },
  };

  writeConfig(cfg);
  console.log(`Config saved to ${CONFIG_PATH}`);
}

function cmdShow(): void {
  const cfg = loadConfig();
  const fileExists = existsSync(CONFIG_PATH);

  if (!fileExists) {
    console.log(`Note: no config file found at ${CONFIG_PATH}`);
  }

  const pad = 20;
  for (const key of VALID_KEYS) {
    let value = getEffectiveValue(key, cfg);
    if (key === "provider.api_key" && value) value = maskSecret(value);
    const source = sourceAnnotation(key);
    console.log(`${key.padEnd(pad)} = ${value}  ${source}`);
  }
}

function cmdGet(key: string): void {
  if (!isValidKey(key)) {
    printKeyError(key);
    process.exit(1);
  }
  const cfg = loadConfig();
  console.log(getEffectiveValue(key, cfg));
}

function cmdSet(key: string, value: string): void {
  if (!isValidKey(key)) {
    printKeyError(key);
    process.exit(1);
  }
  setConfigInFile(key, value);
  console.log(`Updated ${key} in ${CONFIG_PATH}`);
}

// ─── Entry point ─────────────────────────────────────────────────────────────

export async function configCommand(args: string[]): Promise<void> {
  const subcommand = args[0];

  if (subcommand === "init") {
    await cmdInit();
    return;
  }

  if (subcommand === "show") {
    cmdShow();
    return;
  }

  if (subcommand === "get") {
    const key = args[1];
    if (!key) {
      console.error("Error: chloe config get <key>");
      process.exit(1);
    }
    cmdGet(key);
    return;
  }

  if (subcommand === "set") {
    const key = args[1];
    const value = args[2];
    if (!key || value === undefined) {
      console.error("Error: chloe config set <key> <value>");
      process.exit(1);
    }
    cmdSet(key, value);
    return;
  }

  console.error(`Error: unknown config subcommand: '${subcommand ?? ""}'`);
  console.error("Usage: chloe config <init|show|get|set>");
  process.exit(1);
}
