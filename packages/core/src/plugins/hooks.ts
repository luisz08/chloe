import { getLogger } from "../logger/index.js";
import { pluginCacheDir } from "./storage.js";
import type { HookContext, HookEntry, HookEvent } from "./types.js";

export class HookRegistry {
  private entries: HookEntry[] = [];

  register(entry: HookEntry): void {
    this.entries.push(entry);
  }

  registerAll(entries: HookEntry[]): void {
    for (const entry of entries) this.entries.push(entry);
  }

  // Fire-and-forget: starts async execution but returns void immediately
  fire(event: HookEvent, ctx: HookContext): void {
    const matching = this.entries.filter((e) => e.event === event && matchesHook(e, ctx));
    if (matching.length === 0) return;
    // Start sequential execution without awaiting
    executeSequential(matching, ctx).catch((err: unknown) => {
      getLogger("hooks").warn("hook execution error", {
        event,
        error: err instanceof Error ? err.message : String(err),
      });
    });
  }
}

function matchesHook(entry: HookEntry, ctx: HookContext): boolean {
  if (!entry.matcher || entry.matcher === "*") return true;
  return entry.matcher === ctx.toolName;
}

async function executeSequential(entries: HookEntry[], ctx: HookContext): Promise<void> {
  for (const entry of entries) {
    await executeHookCommand(entry, ctx);
  }
}

async function executeHookCommand(entry: HookEntry, ctx: HookContext): Promise<void> {
  const log = getLogger("hooks");
  const pluginRoot = pluginCacheDir(entry.pluginId);
  const command = entry.command.replaceAll("${CHLOE_PLUGIN_ROOT}", pluginRoot);
  const env = buildHookEnv(entry, { ...ctx, pluginRoot });

  const proc = Bun.spawn(["bash", "-c", command], {
    cwd: process.cwd(),
    env,
    stdout: "pipe",
    stderr: "pipe",
  });

  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    proc.kill();
  }, 10_000);

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  clearTimeout(timer);

  if (timedOut) {
    log.warn("hook timed out", { event: entry.event, command, pluginId: entry.pluginId });
    return;
  }
  if (stdout.trim()) log.debug("hook stdout", { event: entry.event, stdout: stdout.trim() });
  if (exitCode !== 0) {
    log.warn("hook exited with non-zero", {
      event: entry.event,
      exitCode,
      stderr: stderr.trim(),
      pluginId: entry.pluginId,
    });
  } else if (stderr.trim()) {
    log.debug("hook stderr", { event: entry.event, stderr: stderr.trim() });
  }
}

function buildHookEnv(
  _entry: HookEntry,
  ctx: HookContext & { pluginRoot: string },
): Record<string, string> {
  // Use a minimal env (PATH only) to avoid leaking ambient secrets like API keys.
  const env: Record<string, string> = {};
  if (process.env.PATH) env.PATH = process.env.PATH;
  if (process.env.HOME) env.HOME = process.env.HOME;
  env.CHLOE_PLUGIN_ROOT = ctx.pluginRoot;
  env.CHLOE_HOOK_EVENT = ctx.event;
  env.CHLOE_SESSION_ID = ctx.sessionId;
  if (ctx.toolName !== undefined) {
    env.CHLOE_TOOL_NAME = ctx.toolName;
  }
  return env;
}
