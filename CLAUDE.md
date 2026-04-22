# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
bun test                                    # run all tests
bun test <path/to/file.test.ts>             # run a single test file
bunx biome check --error-on-warnings .      # lint + format check
bunx tsc --noEmit -p tsconfig.check.json    # type check
```

There is no separate build step — the CLI runs TypeScript source directly via Bun (`bin` points to `./src/index.ts`).

## Architecture

Monorepo with three packages under `packages/`:

- **`packages/core`** — all business logic, imported by cli and api
- **`packages/cli`** — `chloe` binary; subcommands: `chat`, `config`, `sessions`, `serve`, `plugin`
- **`packages/api`** — HTTP server (`Bun.serve`) with REST routes for sessions and messages

### Agent execution flow (`packages/core/src/agent/`)

`Agent.run(sessionId, message)` is the top-level entry point:
1. Lazily initializes plugins once (stores a `Promise<void>` to avoid race conditions on concurrent calls)
2. Fires `SessionStart` hook (fire-and-forget)
3. Loads message history from storage, appends the new user turn
4. Calls `runLoop()` — a `for(;;)` ReAct loop that streams from Anthropic and dispatches tool calls
5. Persists the new turns from `result.messages.slice(messages.length - 1)`
6. Fires `SessionEnd` hook in `finally`

`runLoop` (`loop.ts`) fires `PreToolUse`/`PostToolUse` hooks around each `tool.execute()` call.

### Multi-model routing (`agent/router.ts`)

Config has four model slots: `defaultModel`, `reasoningModel`, `fastModel`, `visionModel`. If any slot differs from `defaultModel`, the agent is in multi-model mode and registers three subagent tools (`vision_analyze`, `fast_query`, `deep_reasoning`) that each make a single API call to their respective model.

### Skills (`packages/core/src/skills/`)

Skills are Markdown files that inject a system prompt when the user types `/skill-name`. Two discovery locations per session (project overrides global):
- Global: `~/.chloe/skills/<name>.md`
- Project: `./.chloe/skills/<name>.md`

Priority order (highest first): project > global > plugin. `mergePluginSkills()` in `loader.ts` applies this merge. `$ARGUMENTS` in skill content is replaced with text typed after the slash command.

`router.ts` intercepts all `/` commands — `routeCommand()` handles `help`, `reload-skills`, `plugin`, and skill dispatch in that order.

### Plugin system (`packages/core/src/plugins/`)

Plugins live in `~/.chloe/plugins/`:
- `known_marketplaces.json` — registered marketplace registry
- `installed.json` — installed plugin records keyed by `name@marketplace`
- `cache/<name@marketplace>/` — installed plugin files

**Marketplace manifest** (in marketplace repo): `.chloe-plugin/marketplace.json`  
**Plugin manifest** (in plugin dir): `.chloe-plugin/plugin.json`

Plugin skills are discovered from `skills/<name>/SKILL.md` and `commands/<name>.md` inside the cache dir.

**Hook system** (`hooks.ts`): `HookRegistry.fire()` is always fire-and-forget (returns `void`, never throws). Hooks run sequentially per event with a 10-second kill timeout. Hook commands receive a minimal env (`PATH`, `HOME`, `CHLOE_PLUGIN_ROOT`, `CHLOE_HOOK_EVENT`, `CHLOE_SESSION_ID`, `CHLOE_TOOL_NAME`) — full `process.env` is intentionally not forwarded to avoid leaking API keys. Events: `SessionStart`, `SessionEnd`, `PreToolUse`, `PostToolUse`, `UserPromptSubmit`.

### Tool sandboxing (`core/src/tools/`)

`bash` tool validates all binary names against an allowlist before execution. Default allowed commands: `ls cat grep find echo pwd wc head tail`. Per-project overrides in `.chloe/settings.json`:

```json
{
  "tools": {
    "bash": { "allowed_commands": ["git", "bun"], "timeout_ms": 30000 },
    "allowed_paths": ["./"]
  }
}
```

### CLI UI (`packages/cli/src/ui/`)

Built with [Ink](https://github.com/vadimdemedes/ink) (React for terminals). `App.tsx` owns all state: message list, streaming buffer, tool confirmation flow, skill cache, and the slash-command palette. `MessageBubble.tsx` renders assistant content through `Bun.markdown.ansi()` for Markdown formatting (requires Bun ≥ 1.3.12).

### Config (`core/src/config.ts`)

TOML config at `~/.chloe/settings/config.toml`. Priority: `CHLOE_*` env vars > TOML > defaults. Primary env vars: `CHLOE_API_KEY`, `CHLOE_MODEL`, `CHLOE_REASONING_MODEL`, `CHLOE_FAST_MODEL`, `CHLOE_VISION_MODEL`.

### Storage (`core/src/storage/`)

`StorageAdapter` interface backed by `SQLiteStorageAdapter` (via `bun:sqlite`). DB at `~/.chloe/sessions/chloe.db`. Sessions have a type field (`"chat"` or `"subagent"`) to distinguish child sessions created by subagent tools.

## Stack

TypeScript 5.x · Bun ≥ 1.3.12 · `@anthropic-ai/sdk` · Ink 6 · `bun:sqlite` · Biome · `smol-toml`
