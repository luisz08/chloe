# Review Guide: Plugin System (`013-plugin-system`)

This document guides reviewers through the plugin system implementation. Each section maps to a specific concern area with targeted review questions and the exact files/lines to check.

---

## 1. Plugin Types & Interfaces (`packages/core/src/plugins/types.ts`)

**What to verify:**
- All interfaces defined in the spec's Key Entities section are present with correct field names and types
- `HookEvent` union covers exactly: `SessionStart | SessionEnd | PreToolUse | PostToolUse | UserPromptSubmit`
- `HookEntry.matcher` is `string | undefined` (not required)
- `InstalledPluginRecord.id` format is `"name@marketplace"`
- `PluginSourceSpec` is a union of string (relative path) and `{ source: "github"; repo: string; ref?: string }`
- No `any` types; all fields have explicit types

**Key question:** Does `LoadedPlugin` correctly separate runtime state from persisted state (`InstalledPluginRecord`)?

---

## 2. JSON Storage (`packages/core/src/plugins/storage.ts`)

**What to verify:**
- `readMarketplaces()` returns `{}` (not throws) when file is missing or corrupt — uses `existsSync` + `try/catch`
- `readInstalled()` same graceful fallback
- All writes call `mkdirSync(dirname(path), { recursive: true })` before `writeFileSync`
- `pluginCacheDir(id)` and `marketplaceCloneDir(name)` return absolute paths under `~/.chloe/plugins/`
- Uses `homedir()` from `node:os`, not `process.env.HOME` (cross-platform)

**Key question:** Does a corrupted `installed.json` produce a clear error message with the file path?

---

## 3. Manifest Parsing (`packages/core/src/plugins/manifest.ts`)

**What to verify:**
- `readPluginManifest()`: if `.chloe-plugin/plugin.json` is absent, returns `{ name: basename(pluginDir) }` fallback (no throw)
- `readMarketplaceManifest()`: throws `Error` with file path + JSON error message if missing or invalid
- `validateMarketplaceManifest()`: checks `name`, `owner`, `plugins` fields present; throws descriptive error for each missing field
- Error messages include the file path so users can find and fix the file

**Key question:** Can a plugin without `plugin.json` be installed and used? (Answer per spec: yes, via directory name fallback.)

---

## 4. Git Operations (`packages/core/src/plugins/git.ts`)

**What to verify:**
- Uses `Bun.spawn` (not `child_process.exec`) — consistent with `bash.ts`
- `gitClone` and `gitPull` both respect `timeoutMs` (default 30s) — uses `setTimeout` → `proc.kill()`
- On non-zero exit code: throws `Error` with stderr content
- On timeout: throws `Error` with "timed out after Xs" message
- `buildGitHubUrl("owner/repo")` → `"https://github.com/owner/repo.git"` (no auth required)
- Both stdout and stderr captured via `new Response(proc.stdout).text()` pattern

**Key question:** Is the partial clone directory cleaned up if `gitClone` fails or times out?

---

## 5. Marketplace Management (`packages/core/src/plugins/marketplace.ts`)

**What to verify:**
- `addMarketplace()` algorithm: clone to temp → read name from manifest → mv to final location → write registry. On ANY failure: cleanup temp dir, don't write to `known_marketplaces.json`
- Adding a duplicate marketplace (same source) → errors with "already registered"
- `removeMarketplace()` cascades to `uninstallPlugin()` for all plugins from that marketplace
- `updateMarketplace()` runs `gitPull` on clone dir, skips local-source marketplaces gracefully
- Local marketplace (`--from-dir`) stores absolute path; does NOT clone

**Key question:** If `marketplace.json` has an invalid `name` (spaces, uppercase), is that caught before writing to the registry?

---

## 6. Plugin Installer (`packages/core/src/plugins/installer.ts`)

**What to verify:**
- `installPlugin()`: errors with "already installed" if `id` exists in `installed.json` (no overwrites)
- `resolvePluginSource()` correctly handles both string (relative path) and `{ source: "github" }` entries
- For relative-path sources: copies from `join(marketplaceCloneDir, relativePath)` to cache
- For GitHub sources: clones to temp, copies to cache, cleans up temp
- `uninstallPlugin()`: removes cache directory AND removes from `installed.json` (atomic: update JSON first, then rm -rf)
- `updatePlugin()`: only re-installs if version strings differ; handles `"unknown"` version gracefully (always re-installs)
- `enablePlugin`/`disablePlugin`: read-modify-write `installed.json` atomically

**Key question:** What happens if cache directory is manually deleted but `installed.json` still has the record? Does `installPlugin` handle this?

---

## 7. Plugin Loader (`packages/core/src/plugins/loader.ts`)

**What to verify:**
- `loadInstalledPlugins()` returns plugins in `installed.json` order (preserves installation order for hook sequencing)
- Only `enabled: true` plugins are loaded
- `discoverSkills()` finds both `skills/<name>/SKILL.md` (directory form) and `commands/<name>.md` (flat form)
- `loadHooks()` returns `[]` when `hooks/hooks.json` is missing (no throw)
- Agents in `agents/` and `.mcp.json` are detected but logged at debug level, not activated
- `${CHLOE_PLUGIN_ROOT}` in hook commands is NOT substituted at load time — substitution happens at fire time

**Key question:** Does `discoverSkills()` reuse `extractDescription()` from `skills/loader.ts`, or duplicate the logic?

---

## 8. Skill Merging (`packages/core/src/skills/loader.ts` + `types.ts`)

**What to verify:**
- `SkillSource` now includes `"plugin"` as a valid value
- `mergePluginSkills(existing, pluginSkills)` priority: existing (project/global) wins over plugin
  - Implementation: build map from plugin skills, then overwrite with existing: `new Map([...pluginMap, ...existingMap])`
- Existing `loadSkills()` function signature is UNCHANGED (backward compatible)
- Call sites (App.tsx, messages.ts, router.ts) correctly call `mergePluginSkills()` after `loadSkills()`

**Key question:** If a plugin skill has the same name as a global skill, which wins? (Should be: global wins.)

---

## 9. Hook System (`packages/core/src/plugins/hooks.ts`)

**What to verify:**
- `HookRegistry.fire()` is truly fire-and-forget: it starts hook execution but does NOT await it before returning
- Despite being async/non-blocking, hooks for the same event fire SEQUENTIALLY (not concurrently) — each waits for the previous
- `matcher` logic: `undefined` or `"*"` matches all tools; any other string requires exact match with `ctx.toolName`
- 10-second timeout per hook: `setTimeout(10_000)` → `proc.kill()` → log warning, don't throw
- `buildHookEnv()` includes all 4 env vars: `CHLOE_PLUGIN_ROOT`, `CHLOE_HOOK_EVENT`, `CHLOE_TOOL_NAME`, `CHLOE_SESSION_ID`
- `cwd` of hook subprocess is `process.cwd()` (user's project dir), NOT the plugin cache dir
- `${CHLOE_PLUGIN_ROOT}` in command string is substituted with `entry.pluginId`'s cache dir

**Key question:** If hook A takes 9s and hook B (same event) needs to run after, does B wait for A to finish? (Yes — sequential.)

---

## 10. Agent Wiring (`packages/core/src/agent/agent.ts` + `loop.ts`)

**What to verify:**
- `Agent` has a `hookRegistry: HookRegistry` field (populated at initialization, not per-run)
- `SessionStart` fires at the start of `Agent.run()` with `void` (not awaited)
- `SessionEnd` fires in the `finally` block of `Agent.run()` with `void` (not awaited)
- `RunLoopOptions` has `hookRegistry?: HookRegistry` (optional, backward compatible)
- `PreToolUse` fires just BEFORE `tool.execute()` call with `void`
- `PostToolUse` fires just AFTER `tool.execute()` succeeds with `void`
- Existing `onToolCall` and `onToolResult` callbacks are NOT removed or replaced — hooks are additive
- `UserPromptSubmit` fires in `App.tsx` `handleSubmit()` BEFORE `routeCommand()` call

**Key question:** If a session has no plugins installed, does the `HookRegistry` still exist (just empty)? (Yes — no null checks needed in loop.ts.)

---

## 11. CLI Commands (`packages/cli/src/commands/plugin.ts`)

**What to verify:**
- No external arg parsing library added — manual `args[0]`, `args[1]`, `args[2]` pattern
- All 10 subcommands implemented: `marketplace add/list/remove/update`, `install/uninstall/update/list/enable/disable`
- `--from-dir <path>` flag for `marketplace add` parsed correctly
- `name@marketplace` parsing: splits on last `@` (in case plugin name contains `@`)
- Error format: `console.error("Error: <message>")` + `process.exit(1)`
- `chloe plugin list` output table includes: name, marketplace, version, status columns
- `index.ts` updated with `plugin` routing and updated help message

**Key question:** Does `chloe plugin install spex@cc-rhuss-marketplace` correctly parse `name="spex"` and `marketplace="cc-rhuss-marketplace"`?

---

## 12. Slash Command Integration (`packages/core/src/skills/router.ts`)

**What to verify:**
- `/plugin` is detected BEFORE skill lookup (checked as command family, not exact string)
- All 10 subcommands work: `marketplace add/list/remove/update`, `install/uninstall/update/list/enable/disable`
- Returns `{ kind: "internal", output: string }` — never sent to AI
- Output is human-readable (same info as CLI output)
- `/plugin` with no subcommand returns usage help, not an error crash

**Key question:** Does `/plugin marketplace add rhuss/cc-rhuss-marketplace` (with spaces in args) parse correctly?

---

## 13. Tests

**What to verify:**
- `manifest.test.ts`: covers missing file fallback, invalid JSON throw with file path
- `hooks.test.ts`: covers matcher filtering (exact, `*`, absent), non-zero exit → warning, 10s timeout kills process
- `loader.test.ts`: `mergePluginSkills` priority verified (plugin vs global vs project collision)
- `marketplace.test.ts`: rollback on clone failure (no partial registry write)
- Integration test: installs local plugin, verifies skill available AND hook fires
- `012-skill-system` tests: ALL pass with no modification

**Key question:** Are hooks tested with actual `Bun.spawn` or with a mock? (Either is fine, but document the approach.)

---

## Coverage Matrix

| Requirement | Plan Section | Tasks Phase |
|-------------|-------------|-------------|
| FR-001 (marketplace add + temp/mv) | Phase 2 | Phase 2 |
| FR-002 (from-dir local) | Phase 2 | Phase 2, 6 |
| FR-003 (manifest location) | Phase 1 | Phase 1 |
| FR-004 (marketplace list) | Phase 6 | Phase 6 |
| FR-005 (remove + cascade) | Phase 2 | Phase 2 |
| FR-006 (marketplace update) | Phase 2 | Phase 2 |
| FR-007 (install copy to cache) | Phase 3 | Phase 3 |
| FR-008 (relative path + github sources) | Phase 3 | Phase 3 |
| FR-009 (uninstall) | Phase 3 | Phase 3 |
| FR-010 (plugin list) | Phase 6 | Phase 6 |
| FR-011 (enable/disable) | Phase 3 | Phase 3 |
| FR-012 (update + version check) | Phase 3 | Phase 3 |
| FR-013 (load at startup) | Phase 8 | Phase 8 |
| FR-014 (skill priority merging) | Phase 4 | Phase 4 |
| FR-015 (hooks registered at start) | Phase 5 | Phase 5 |
| FR-016 (CHLOE_PLUGIN_ROOT + cwd) | Phase 5 | Phase 5 |
| FR-017 (agents/MCP parsed, not activated) | Phase 4 | Phase 4 |
| FR-018 (HookRegistry events) | Phase 5 | Phase 5 |
| FR-019 (matcher exact or *) | Phase 5 | Phase 5 |
| FR-020 (shell subprocess, stdout/stderr) | Phase 5 | Phase 5 |
| FR-021/021b (non-zero → warning, notification-only) | Phase 5 | Phase 5 |
| FR-021c (sequential execution order) | Phase 5 | Phase 5 |
| FR-022 (PreToolUse/PostToolUse wiring) | Phase 5 | Phase 5 |
| FR-023/023b (SessionStart/End + UserPromptSubmit) | Phase 5 | Phase 5 |
| FR-024 (/plugin recognized) | Phase 7 | Phase 7 |
| FR-025 (all slash subcommands) | Phase 7 | Phase 7 |
| FR-026 (/plugin inline output) | Phase 7 | Phase 7 |
| NFR-001 (30s git timeout) | Phase 2 git.ts | Phase 2 |
| NFR-002 (200ms load for 20 plugins) | Phase 4 | Phase 8 |
| NFR-003 (hooks async, 10s timeout) | Phase 5 | Phase 5 |
| NFR-004 (JSON corruption error) | Phase 1 | Phase 1 |

**All 31 requirements covered. ✅**
