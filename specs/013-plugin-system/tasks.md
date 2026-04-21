# Tasks: Plugin System

## Phase 1 — Types & Storage Primitives

- [X] Create `packages/core/src/plugins/types.ts` — all interfaces: `HookEntry`, `HookContext`, `HookEvent`, `MarketplaceRecord`, `MarketplaceManifest`, `MarketplacePluginEntry`, `PluginManifest`, `InstalledPluginRecord`, `LoadedPlugin`, `PluginSkillEntry`, `PluginSourceSpec`
- [X] Create `packages/core/src/plugins/storage.ts` — `readMarketplaces()`, `writeMarketplaces()`, `readInstalled()`, `writeInstalled()`, `pluginCacheDir()`, `marketplaceCloneDir()`
- [X] Create `packages/core/src/plugins/manifest.ts` — `readPluginManifest()` (fallback name if missing), `readMarketplaceManifest()` (throw with path on invalid JSON), `validateMarketplaceManifest()`
- [X] Create `packages/core/src/plugins/index.ts` — public exports for plugin subsystem
- [X] Add `source: "plugin"` to `SkillSource` type in `packages/core/src/skills/types.ts`

## Phase 2 — Git & Marketplace Operations

- [X] Create `packages/core/src/plugins/git.ts`
  - [X] `gitClone(url, dest, timeoutMs?)` — Bun.spawn pattern from `bash.ts`; throws on non-zero exit or timeout
  - [X] `gitPull(dir, timeoutMs?)` — same pattern
  - [X] `buildGitHubUrl(repo)` — `"owner/repo"` → `"https://github.com/owner/repo.git"`
- [X] Create `packages/core/src/plugins/marketplace.ts`
  - [X] `addMarketplace(source, fromDir?)` — clone to temp, read name from manifest, mv to final location; rollback temp on error
  - [X] `listMarketplaces()` — read `known_marketplaces.json`, return array
  - [X] `removeMarketplace(name)` — uninstall all plugins from marketplace, remove from registry
  - [X] `updateMarketplace(name?)` — `gitPull` on clone dir(s), re-read manifests
  - [X] `getMarketplacePlugins(name)` — read marketplace's `marketplace.json`, return plugin entries

## Phase 3 — Plugin Installer

- [X] Create `packages/core/src/plugins/installer.ts`
  - [X] `installPlugin(pluginName, marketplaceName)` — resolve source, copy to cache, write `installed.json`; error if already installed
  - [X] `resolvePluginSource(entry, marketplaceCloneDir)` — handle relative path and `{ source: "github" }` sources
  - [X] `uninstallPlugin(pluginId)` — remove cache dir + remove from `installed.json`
  - [X] `enablePlugin(pluginId)` / `disablePlugin(pluginId)` — toggle `enabled` flag in `installed.json`
  - [X] `updatePlugin(pluginId)` — re-install if version in marketplace differs from installed version
  - [X] `listPlugins()` — read `installed.json`, return array

## Phase 4 — Plugin Loader (Runtime)

- [X] Create `packages/core/src/plugins/loader.ts`
  - [X] `loadInstalledPlugins()` — read `installed.json`, filter enabled, call `loadPlugin()` for each in order
  - [X] `loadPlugin(record)` — read manifest, discover skills from `skills/` and `commands/`, load hooks
  - [X] `discoverSkills(cacheDir, manifest)` — reads `skills/<name>/SKILL.md` and `commands/<name>.md`; reuses `extractDescription()` from `skills/loader.ts`
  - [X] `loadHooks(cacheDir, manifest, pluginId)` — reads `hooks/hooks.json`; returns `[]` if missing; annotates each entry with `pluginId`
  - [X] Parse `agents/` and `.mcp.json` if present but do NOT activate — log at debug level "not yet supported"
- [X] Extend `packages/core/src/skills/loader.ts` — add `mergePluginSkills(existing: Skill[], pluginSkills: PluginSkillEntry[]): Skill[]` (plugin skills are lowest priority: project > global > plugin)

## Phase 5 — Hook System

- [X] Create `packages/core/src/plugins/hooks.ts`
  - [X] `HookRegistry` class with `register(entry)`, `registerAll(entries)`, `fire(event, ctx)` methods
  - [X] `fire()` — all hooks are async fire-and-forget (never await completion, never throw); execute entries for matching event sequentially in registration order
  - [X] Matcher logic: absent or `"*"` → match all tools; otherwise exact `toolName === matcher`
  - [X] `executeHookCommand(entry, ctx)` — Bun.spawn with `cwd: process.cwd()`, 10s kill timeout, log warning on timeout or non-zero exit
  - [X] `buildHookEnv(entry, ctx)` — `{ ...process.env, CHLOE_PLUGIN_ROOT, CHLOE_HOOK_EVENT, CHLOE_TOOL_NAME, CHLOE_SESSION_ID }`
  - [X] Substitute `${CHLOE_PLUGIN_ROOT}` in command string before execution
- [X] Wire `HookRegistry` into `Agent` class (`agent/agent.ts`)
  - [X] Add `hookRegistry: HookRegistry` field to `Agent`
  - [X] Call `hookRegistry.registerAll()` during plugin initialization (in `createAgent()` or `agent.initialize()`)
  - [X] Fire `"SessionStart"` at start of `Agent.run()` (void — don't await)
  - [X] Fire `"SessionEnd"` in `Agent.run()` finally block (void — don't await)
- [X] Wire `PreToolUse`/`PostToolUse` into `runLoop` (`agent/loop.ts`)
  - [X] Add `hookRegistry?: HookRegistry` to `RunLoopOptions`
  - [X] Fire `"PreToolUse"` just before `tool.execute()` call (void — don't await)
  - [X] Fire `"PostToolUse"` just after `tool.execute()` succeeds (void — don't await)
- [X] Wire `UserPromptSubmit` in `packages/cli/src/ui/App.tsx`
  - [X] Fire before `routeCommand()` in `handleSubmit()` (void — don't await)

## Phase 6 — CLI Commands

- [X] Create `packages/cli/src/commands/plugin.ts`
  - [X] `chloe plugin marketplace add <owner/repo>` and `--from-dir <path>`
  - [X] `chloe plugin marketplace list` — tabular output: name, source, plugin count
  - [X] `chloe plugin marketplace remove <name>`
  - [X] `chloe plugin marketplace update [name]`
  - [X] `chloe plugin install <name@marketplace>` — parse `@` separator
  - [X] `chloe plugin uninstall <name@marketplace>`
  - [X] `chloe plugin list` — tabular output: name, marketplace, version, status
  - [X] `chloe plugin enable <name@marketplace>`
  - [X] `chloe plugin disable <name@marketplace>`
  - [X] `chloe plugin update <name@marketplace>`
- [X] Register `plugin` subcommand in `packages/cli/src/index.ts`; update error message to include "plugin"

## Phase 7 — Slash Command Integration

- [X] Extend `packages/core/src/skills/router.ts` to recognize `/plugin` prefix (before skill lookup)
- [X] Add `handlePluginSlashCommand(args: string): Promise<string>` — parse subcommand string and dispatch to plugin functions
- [X] Support all subcommands per FR-025: `marketplace add`, `marketplace list`, `marketplace remove`, `marketplace update`, `install`, `uninstall`, `update`, `list`, `enable`, `disable`
- [X] Return `CommandResult { kind: "internal", output: string }` for all `/plugin` subcommands

## Phase 8 — Integration, Exports & Tests

- [X] Update `packages/core/src/index.ts` to export plugin subsystem public API
- [X] Update skill loading call sites (App.tsx, messages.ts) to call `mergePluginSkills()` after `loadSkills()`
- [X] Update `packages/core/src/agent/types.ts` — add `hookRegistry?: HookRegistry` to agent config if needed (not needed: HookRegistry is internal to Agent)
- [X] Write unit tests for `manifest.ts` — valid plugin.json, missing file (fallback), invalid JSON (throw with path), missing required fields
- [ ] Write unit tests for `storage.ts` — write/read round-trip, corrupted file → empty result (deferred: requires filesystem fixtures)
- [X] Write unit tests for `hooks.ts` — event firing, matcher filtering (exact/wildcard/absent), non-zero exit → warning not throw, 10s timeout behavior
- [X] Write unit tests for `loader.ts` — `mergePluginSkills()` priority (plugin loses to global and project), skill discovery from `skills/` and `commands/`
- [ ] Write unit tests for `marketplace.ts` — add with mock git, duplicate → error, remove cascades, invalid manifest → throw (deferred: integration test phase)
- [ ] Write unit tests for `installer.ts` — install/uninstall/enable/disable state transitions (deferred: integration test phase)
- [ ] Write integration test — install local plugin → skill available, PostToolUse hook fires to log file (deferred: integration test phase)
- [X] Regression: verify all `packages/core/src/skills/` tests still pass
- [X] Run `bunx biome check --error-on-warnings .` — zero issues
- [X] Run `bunx tsc --noEmit -p tsconfig.check.json` — zero errors
