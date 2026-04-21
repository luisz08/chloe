# Tasks: Plugin System

## Phase 1 — Types & Storage Primitives

- [ ] Create `packages/core/src/plugins/types.ts` — all interfaces: `HookEntry`, `HookContext`, `HookEvent`, `MarketplaceRecord`, `MarketplaceManifest`, `MarketplacePluginEntry`, `PluginManifest`, `InstalledPluginRecord`, `LoadedPlugin`, `PluginSkillEntry`, `PluginSourceSpec`
- [ ] Create `packages/core/src/plugins/storage.ts` — `readMarketplaces()`, `writeMarketplaces()`, `readInstalled()`, `writeInstalled()`, `pluginCacheDir()`, `marketplaceCloneDir()`
- [ ] Create `packages/core/src/plugins/manifest.ts` — `readPluginManifest()` (fallback name if missing), `readMarketplaceManifest()` (throw with path on invalid JSON), `validateMarketplaceManifest()`
- [ ] Create `packages/core/src/plugins/index.ts` — public exports for plugin subsystem
- [ ] Add `source: "plugin"` to `SkillSource` type in `packages/core/src/skills/types.ts`

## Phase 2 — Git & Marketplace Operations

- [ ] Create `packages/core/src/plugins/git.ts`
  - [ ] `gitClone(url, dest, timeoutMs?)` — Bun.spawn pattern from `bash.ts`; throws on non-zero exit or timeout
  - [ ] `gitPull(dir, timeoutMs?)` — same pattern
  - [ ] `buildGitHubUrl(repo)` — `"owner/repo"` → `"https://github.com/owner/repo.git"`
- [ ] Create `packages/core/src/plugins/marketplace.ts`
  - [ ] `addMarketplace(source, fromDir?)` — clone to temp, read name from manifest, mv to final location; rollback temp on error
  - [ ] `listMarketplaces()` — read `known_marketplaces.json`, return array
  - [ ] `removeMarketplace(name)` — uninstall all plugins from marketplace, remove from registry
  - [ ] `updateMarketplace(name?)` — `gitPull` on clone dir(s), re-read manifests
  - [ ] `getMarketplacePlugins(name)` — read marketplace's `marketplace.json`, return plugin entries

## Phase 3 — Plugin Installer

- [ ] Create `packages/core/src/plugins/installer.ts`
  - [ ] `installPlugin(pluginName, marketplaceName)` — resolve source, copy to cache, write `installed.json`; error if already installed
  - [ ] `resolvePluginSource(entry, marketplaceCloneDir)` — handle relative path and `{ source: "github" }` sources
  - [ ] `uninstallPlugin(pluginId)` — remove cache dir + remove from `installed.json`
  - [ ] `enablePlugin(pluginId)` / `disablePlugin(pluginId)` — toggle `enabled` flag in `installed.json`
  - [ ] `updatePlugin(pluginId)` — re-install if version in marketplace differs from installed version
  - [ ] `listPlugins()` — read `installed.json`, return array

## Phase 4 — Plugin Loader (Runtime)

- [ ] Create `packages/core/src/plugins/loader.ts`
  - [ ] `loadInstalledPlugins()` — read `installed.json`, filter enabled, call `loadPlugin()` for each in order
  - [ ] `loadPlugin(record)` — read manifest, discover skills from `skills/` and `commands/`, load hooks
  - [ ] `discoverSkills(cacheDir, manifest)` — reads `skills/<name>/SKILL.md` and `commands/<name>.md`; reuses `extractDescription()` from `skills/loader.ts`
  - [ ] `loadHooks(cacheDir, manifest, pluginId)` — reads `hooks/hooks.json`; returns `[]` if missing; annotates each entry with `pluginId`
  - [ ] Parse `agents/` and `.mcp.json` if present but do NOT activate — log at debug level "not yet supported"
- [ ] Extend `packages/core/src/skills/loader.ts` — add `mergePluginSkills(existing: Skill[], pluginSkills: PluginSkillEntry[]): Skill[]` (plugin skills are lowest priority: project > global > plugin)

## Phase 5 — Hook System

- [ ] Create `packages/core/src/plugins/hooks.ts`
  - [ ] `HookRegistry` class with `register(entry)`, `registerAll(entries)`, `fire(event, ctx)` methods
  - [ ] `fire()` — all hooks are async fire-and-forget (never await completion, never throw); execute entries for matching event sequentially in registration order
  - [ ] Matcher logic: absent or `"*"` → match all tools; otherwise exact `toolName === matcher`
  - [ ] `executeHookCommand(entry, ctx)` — Bun.spawn with `cwd: process.cwd()`, 10s kill timeout, log warning on timeout or non-zero exit
  - [ ] `buildHookEnv(entry, ctx)` — `{ ...process.env, CHLOE_PLUGIN_ROOT, CHLOE_HOOK_EVENT, CHLOE_TOOL_NAME, CHLOE_SESSION_ID }`
  - [ ] Substitute `${CHLOE_PLUGIN_ROOT}` in command string before execution
- [ ] Wire `HookRegistry` into `Agent` class (`agent/agent.ts`)
  - [ ] Add `hookRegistry: HookRegistry` field to `Agent`
  - [ ] Call `hookRegistry.registerAll()` during plugin initialization (in `createAgent()` or `agent.initialize()`)
  - [ ] Fire `"SessionStart"` at start of `Agent.run()` (void — don't await)
  - [ ] Fire `"SessionEnd"` in `Agent.run()` finally block (void — don't await)
- [ ] Wire `PreToolUse`/`PostToolUse` into `runLoop` (`agent/loop.ts`)
  - [ ] Add `hookRegistry?: HookRegistry` to `RunLoopOptions`
  - [ ] Fire `"PreToolUse"` just before `tool.execute()` call (void — don't await)
  - [ ] Fire `"PostToolUse"` just after `tool.execute()` succeeds (void — don't await)
- [ ] Wire `UserPromptSubmit` in `packages/cli/src/ui/App.tsx`
  - [ ] Fire before `routeCommand()` in `handleSubmit()` (void — don't await)

## Phase 6 — CLI Commands

- [ ] Create `packages/cli/src/commands/plugin.ts`
  - [ ] `chloe plugin marketplace add <owner/repo>` and `--from-dir <path>`
  - [ ] `chloe plugin marketplace list` — tabular output: name, source, plugin count
  - [ ] `chloe plugin marketplace remove <name>`
  - [ ] `chloe plugin marketplace update [name]`
  - [ ] `chloe plugin install <name@marketplace>` — parse `@` separator
  - [ ] `chloe plugin uninstall <name@marketplace>`
  - [ ] `chloe plugin list` — tabular output: name, marketplace, version, status
  - [ ] `chloe plugin enable <name@marketplace>`
  - [ ] `chloe plugin disable <name@marketplace>`
  - [ ] `chloe plugin update <name@marketplace>`
- [ ] Register `plugin` subcommand in `packages/cli/src/index.ts`; update error message to include "plugin"

## Phase 7 — Slash Command Integration

- [ ] Extend `packages/core/src/skills/router.ts` to recognize `/plugin` prefix (before skill lookup)
- [ ] Add `handlePluginSlashCommand(args: string): Promise<string>` — parse subcommand string and dispatch to plugin functions
- [ ] Support all subcommands per FR-025: `marketplace add`, `marketplace list`, `marketplace remove`, `marketplace update`, `install`, `uninstall`, `update`, `list`, `enable`, `disable`
- [ ] Return `CommandResult { kind: "internal", output: string }` for all `/plugin` subcommands

## Phase 8 — Integration, Exports & Tests

- [ ] Update `packages/core/src/index.ts` to export plugin subsystem public API
- [ ] Update skill loading call sites (App.tsx, messages.ts) to call `mergePluginSkills()` after `loadSkills()`
- [ ] Update `packages/core/src/agent/types.ts` — add `hookRegistry?: HookRegistry` to agent config if needed
- [ ] Write unit tests for `manifest.ts` — valid plugin.json, missing file (fallback), invalid JSON (throw with path), missing required fields
- [ ] Write unit tests for `storage.ts` — write/read round-trip, corrupted file → empty result
- [ ] Write unit tests for `hooks.ts` — event firing, matcher filtering (exact/wildcard/absent), non-zero exit → warning not throw, 10s timeout behavior
- [ ] Write unit tests for `loader.ts` — `mergePluginSkills()` priority (plugin loses to global and project), skill discovery from `skills/` and `commands/`
- [ ] Write unit tests for `marketplace.ts` — add with mock git, duplicate → error, remove cascades, invalid manifest → throw
- [ ] Write unit tests for `installer.ts` — install/uninstall/enable/disable state transitions
- [ ] Write integration test — install local plugin → skill available, PostToolUse hook fires to log file
- [ ] Regression: verify all `packages/core/src/skills/` tests still pass
- [ ] Run `bunx biome check --error-on-warnings .` — zero issues
- [ ] Run `bunx tsc --noEmit -p tsconfig.check.json` — zero errors
