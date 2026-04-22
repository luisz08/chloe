# Implementation Plan: Plugin System

**Branch**: `013-plugin-system` | **Date**: 2026-04-20 | **Spec**: specs/013-plugin-system/spec.md

## Summary

Add a plugin system to chloe that mirrors Claude Code's plugin architecture. Plugins are installed from GitHub-hosted marketplaces or local directories and can contribute skills, hooks, and (future) agents/MCP servers. The implementation adds a new `plugins/` subsystem to `@chloe/core`, a `chloe plugin` CLI subcommand, and `/plugin` slash command routing.

## Technical Context

**Language/Version**: TypeScript 5.x, strict mode  
**Runtime**: Bun ≥ 1.1  
**Primary Dependencies**: `node:fs`, `node:path`, `node:os`, Bun.spawn (for git)  
**Storage**: JSON files in `~/.chloe/plugins/` (mirrors `recents.ts` pattern)  
**Testing**: `bun test`  
**Target Platform**: Linux/macOS (git must be in PATH)  
**Performance Goals**: Plugin load < 200ms for 20 plugins; hook fire < 10s timeout  
**Constraints**: No new npm dependencies; strict TypeScript; Biome clean  
**Project Type**: CLI tool + library  

## Constitution Check

| Principle | Status | Notes |
|-----------|--------|-------|
| Core-Library-First | ✅ | All plugin logic in `packages/core/src/plugins/` |
| Strict TypeScript | ✅ | No `any`, no `as` casts; all interfaces defined |
| Biome | ✅ | Run `bunx biome check` after each phase |
| DRY | ✅ | Reuse `expandHome()`, Bun.spawn pattern from bash.ts |
| Plugin Contracts | ✅ | `HookRegistry`, `MarketplaceRecord` are interfaces first |
| Streaming | N/A | Plugin system doesn't interact with Claude API |
| Unit Tests | ✅ | Required for manifest parsing, hook firing, skill merging |
| Human-in-the-Loop | ✅ | Not affected (plugin install is explicit user action) |

## Project Structure

### New Files

```
packages/core/src/plugins/
├── types.ts           # All interfaces: Plugin, Marketplace, HookEntry, etc.
├── storage.ts         # Read/write known_marketplaces.json and installed.json
├── manifest.ts        # Parse and validate plugin.json and marketplace.json
├── git.ts             # Bun.spawn wrappers: clone(url, dest), pull(dir)
├── marketplace.ts     # add/list/remove/update marketplace operations
├── installer.ts       # install/uninstall/enable/disable/update plugin
├── loader.ts          # Load enabled plugins → skills + hooks at runtime
├── hooks.ts           # HookRegistry class + shell execution
└── index.ts           # Public exports for this subsystem

packages/cli/src/commands/
└── plugin.ts          # chloe plugin <subcommand> implementation
```

### Modified Files

```
packages/core/src/skills/loader.ts   # Add plugin skill merging (3rd tier)
packages/core/src/skills/router.ts   # Add /plugin command family
packages/core/src/skills/types.ts    # Add source: "plugin" to SkillSource
packages/core/src/agent/agent.ts     # Add HookRegistry field; fire SessionStart/End
packages/core/src/agent/loop.ts      # Fire PreToolUse/PostToolUse around line 127
packages/core/src/agent/types.ts     # Add hookRegistry to Agent config (optional)
packages/core/src/index.ts           # Export plugin subsystem
packages/cli/src/index.ts            # Add "plugin" subcommand routing
packages/cli/src/ui/App.tsx          # Fire UserPromptSubmit hook before routeCommand
```

## Phase 1: Types & Storage Primitives

**Goal**: Define all interfaces and JSON file read/write. No business logic.

### `plugins/types.ts`

```typescript
export type HookEvent = "SessionStart" | "SessionEnd" | "PreToolUse" | "PostToolUse" | "UserPromptSubmit"

export interface HookEntry {
  event: HookEvent
  matcher?: string          // exact tool name or "*"; absent = all tools
  type: "command"
  command: string           // ${CHLOE_PLUGIN_ROOT} substitution supported
  pluginId: string
}

export interface HookContext {
  event: HookEvent
  toolName?: string
  sessionId: string
  pluginRoot: string
}

export type MarketplaceSourceType =
  | { type: "github"; repo: string; ref?: string }
  | { type: "local"; path: string }

export type PluginSourceSpec =
  | string                                          // relative path "./plugins/spex"
  | { source: "github"; repo: string; ref?: string }

export interface MarketplacePluginEntry {
  name: string
  source: PluginSourceSpec
  description?: string
  version?: string
}

export interface MarketplaceManifest {
  name: string
  owner: { name: string; email?: string }
  metadata?: { description?: string }
  plugins: MarketplacePluginEntry[]
}

export interface PluginManifest {
  name: string
  version?: string
  description?: string
  author?: { name: string; email?: string }
  skills?: string | string[]
  commands?: string | string[]
  hooks?: string
}

export interface MarketplaceRecord {
  name: string
  addedAt: string
  source: MarketplaceSourceType
  cloneDir: string | null
}

export interface InstalledPluginRecord {
  id: string              // "name@marketplace"
  name: string
  marketplace: string
  version: string         // from plugin.json or "unknown"
  enabled: boolean
  cacheDir: string
  installedAt: string
}

export interface LoadedPlugin {
  id: string
  manifest: PluginManifest
  cacheDir: string
  skills: PluginSkillEntry[]
  hookEntries: HookEntry[]
}

export interface PluginSkillEntry {
  name: string
  content: string
  description: string
  pluginId: string
}
```

### `plugins/storage.ts`

Mirrors `skills/recents.ts` pattern exactly.

```typescript
const PLUGINS_DIR = join(homedir(), ".chloe", "plugins")
const MARKETPLACES_FILE = join(PLUGINS_DIR, "known_marketplaces.json")
const INSTALLED_FILE = join(PLUGINS_DIR, "installed.json")

export function readMarketplaces(): Record<string, MarketplaceRecord>
export function writeMarketplaces(data: Record<string, MarketplaceRecord>): void
export function readInstalled(): Record<string, InstalledPluginRecord>
export function writeInstalled(data: Record<string, InstalledPluginRecord>): void
export function pluginCacheDir(pluginId: string): string  // ~/.chloe/plugins/cache/<id>
export function marketplaceCloneDir(name: string): string // ~/.chloe/plugins/marketplaces/<name>
```

All writes: `mkdirSync(dirname(path), { recursive: true })` then `writeFileSync`.  
All reads: `existsSync` guard + `try/catch` returning empty object on failure.

### `plugins/manifest.ts`

```typescript
export function readPluginManifest(pluginDir: string): PluginManifest
// reads .chloe-plugin/plugin.json; returns { name: basename(pluginDir) } if missing

export function readMarketplaceManifest(marketplaceDir: string): MarketplaceManifest
// reads .chloe-plugin/marketplace.json; throws with path + message on missing/invalid JSON

export function validateMarketplaceManifest(raw: unknown): MarketplaceManifest
// throws descriptive error if name/owner/plugins are missing
```

**Tests**: valid JSON, missing `plugin.json` (fallback), missing `marketplace.json` (throw), invalid JSON (throw with location).

---

## Phase 2: Git & Marketplace Operations

### `plugins/git.ts`

```typescript
// Mirrors bash.ts Bun.spawn pattern exactly
export async function gitClone(url: string, dest: string, timeoutMs = 30_000): Promise<void>
// throws Error with stderr on non-zero exit or timeout

export async function gitPull(dir: string, timeoutMs = 30_000): Promise<void>
// throws Error on non-zero exit or timeout

function buildGitHubUrl(repo: string): string
// "owner/repo" → "https://github.com/owner/repo.git"
```

**Implementation detail**: `Bun.spawn(["git", "clone", url, dest], { stdout: "pipe", stderr: "pipe" })`, `setTimeout` → `proc.kill()`, `Promise.all([stdout.text(), stderr.text(), proc.exited])`.

### `plugins/marketplace.ts`

```typescript
export async function addMarketplace(source: string, fromDir?: string): Promise<MarketplaceRecord>
// source is "owner/repo" or GitHub URL
// Algorithm:
//   1. Clone to tmpDir (or use fromDir as-is)
//   2. readMarketplaceManifest(tmpDir) → get name
//   3. mv tmpDir → marketplaceCloneDir(name)  [or record local path]
//   4. writeMarketplaces({ ...existing, [name]: record })
//   5. return record

export function listMarketplaces(): MarketplaceRecord[]

export async function removeMarketplace(name: string): Promise<void>
// uninstall all plugins from this marketplace, then remove from registry

export async function updateMarketplace(name?: string): Promise<void>
// gitPull on clone dir(s), re-read manifests

export function getMarketplacePlugins(name: string): MarketplacePluginEntry[]
// reads installed marketplace's marketplace.json
```

---

## Phase 3: Plugin Installer

### `plugins/installer.ts`

```typescript
export async function installPlugin(pluginName: string, marketplaceName: string): Promise<InstalledPluginRecord>
// 1. getMarketplacePlugins(marketplace) → find entry
// 2. resolvePluginSource(entry, marketplaceCloneDir) → sourceDir
// 3. copyDir(sourceDir, pluginCacheDir(id))
// 4. readPluginManifest(cacheDir) → version
// 5. writeInstalled({ ...existing, [id]: record })

export async function uninstallPlugin(pluginId: string): Promise<void>
// rm -rf cacheDir, remove from installed.json

export function enablePlugin(pluginId: string): void
export function disablePlugin(pluginId: string): void
// toggle enabled flag in installed.json

export async function updatePlugin(pluginId: string): Promise<void>
// re-run installPlugin if version in marketplace.json differs from installed version

export function listPlugins(): InstalledPluginRecord[]
```

**`resolvePluginSource`** handles:
- String (relative path): `join(marketplaceCloneDir, source)` — copy the subdir
- `{ source: "github", repo }`: `gitClone` to temp, then use as sourceDir

**`copyDir`**: recursive `cp -r` via `Bun.spawn(["cp", "-r", src, dest])` or Node.js recursive copy.

---

## Phase 4: Plugin Loader (Runtime)

### `plugins/loader.ts`

```typescript
export async function loadInstalledPlugins(): Promise<LoadedPlugin[]>
// 1. readInstalled() → filter enabled
// 2. For each: loadPlugin(record)
// Returns in installed.json order (for hook execution order)

function loadPlugin(record: InstalledPluginRecord): LoadedPlugin
// 1. readPluginManifest(record.cacheDir)
// 2. discoverSkills(record.cacheDir, manifest) → PluginSkillEntry[]
// 3. loadHooks(record.cacheDir, manifest, record.id) → HookEntry[]
// 4. return { id, manifest, cacheDir, skills, hookEntries }

function discoverSkills(cacheDir: string, manifest: PluginManifest): PluginSkillEntry[]
// reads skills/<name>/SKILL.md and commands/<name>.md
// extracts description from frontmatter (reuse extractDescription from loader.ts)

function loadHooks(cacheDir: string, manifest: PluginManifest, pluginId: string): HookEntry[]
// reads hooks/hooks.json, parses entries, substitutes ${CHLOE_PLUGIN_ROOT}
// returns [] if file missing
```

### Skill Loader Extension (`skills/loader.ts`)

**Add `source: "plugin"` to `SkillSource`** in `skills/types.ts`:
```typescript
export type SkillSource = "global" | "project" | "plugin"
```

**New export** in `skills/loader.ts`:
```typescript
export function mergePluginSkills(
  existing: Skill[],           // already merged global+project
  pluginSkills: PluginSkillEntry[]
): Skill[]
// Build map from pluginSkills, then overwrite with existing (project/global win)
// existing wins: new Map([...pluginMap, ...existingMap])
```

**`loadSkills()` stays unchanged**. Callers (App.tsx, messages.ts, router.ts) get plugin skills injected separately via `mergePluginSkills()` after loading plugins.

---

## Phase 5: Hook System

### `plugins/hooks.ts`

```typescript
export class HookRegistry {
  private entries: HookEntry[] = []

  register(entry: HookEntry): void {
    this.entries.push(entry)
  }

  registerAll(entries: HookEntry[]): void {
    this.entries.push(...entries)
  }

  async fire(event: HookEvent, ctx: Omit<HookContext, "pluginRoot">): Promise<void>
  // 1. Filter entries where entry.event === event
  // 2. For PreToolUse/PostToolUse: also filter by matcher
  //    - matcher absent or "*" → always match
  //    - otherwise: ctx.toolName === entry.matcher
  // 3. Execute each sequentially (for...of, await each)
  // 4. Never throw — catch all errors, log as warnings
}

async function executeHookCommand(entry: HookEntry, ctx: HookContext): Promise<void>
// 1. Substitute ${CHLOE_PLUGIN_ROOT} in command string
// 2. Bun.spawn(["sh", "-c", command], { cwd: process.cwd(), env: buildHookEnv(entry, ctx) })
// 3. setTimeout(10_000) → proc.kill() + log warning "hook timed out"
// 4. await proc.exited; if non-zero → log warning, don't throw

function buildHookEnv(entry: HookEntry, ctx: HookContext): Record<string, string>
// Returns { ...process.env, CHLOE_PLUGIN_ROOT: ctx.pluginRoot,
//           CHLOE_HOOK_EVENT: ctx.event, CHLOE_TOOL_NAME: ctx.toolName ?? "",
//           CHLOE_SESSION_ID: ctx.sessionId }
```

### Wire hooks into `agent/agent.ts`

Add `hookRegistry: HookRegistry` field to `Agent`. Populate it in a new `loadPlugins()` method called during `createAgent()` or lazily on first `run()`.

```typescript
// In Agent.run() — beginning (after startMs):
void this.hookRegistry.fire("SessionStart", { sessionId })

// In Agent.run() — finally block (before clearing bashPermissionRef):
void this.hookRegistry.fire("SessionEnd", { sessionId })
```

Both are fire-and-forget (`void` — don't await).

### Wire hooks into `agent/loop.ts`

Around line 127, add to the existing try block:

```typescript
// Before tool execute (line 127):
void options.hookRegistry?.fire("PreToolUse", { toolName, sessionId: toolContext?.sessionId ?? "" })

// After tool execute succeeds (after line 127, before line 129):
void options.hookRegistry?.fire("PostToolUse", { toolName, sessionId: toolContext?.sessionId ?? "" })
```

Add `hookRegistry?: HookRegistry` to `RunLoopOptions` (optional, backward compatible).

### Wire `UserPromptSubmit` in `App.tsx`

In `handleSubmit()`, before the `routeCommand()` call:
```typescript
void hookRegistry?.fire("UserPromptSubmit", { sessionId: currentSessionId })
```

`App.tsx` receives `hookRegistry` as a prop from `chat.ts`, where it's created after plugin loading.

---

## Phase 6: CLI Subcommand

### `commands/plugin.ts`

```typescript
export async function pluginCommand(args: string[]): Promise<void>
```

Routing table (manual, no library):

| `args[0]` | `args[1]` | `args[2]` | Action |
|-----------|-----------|-----------|--------|
| `marketplace` | `add` | `owner/repo` or `--from-dir path` | `addMarketplace()` |
| `marketplace` | `list` | — | `listMarketplaces()` → print table |
| `marketplace` | `remove` | `<name>` | `removeMarketplace()` |
| `marketplace` | `update` | `[name]` | `updateMarketplace()` |
| `install` | `<name@mkt>` | — | parse `@`, call `installPlugin()` |
| `uninstall` | `<name@mkt>` | — | `uninstallPlugin()` |
| `list` | — | — | `listPlugins()` → print table |
| `enable` | `<name@mkt>` | — | `enablePlugin()` |
| `disable` | `<name@mkt>` | — | `disablePlugin()` |
| `update` | `<name@mkt>` | — | `updatePlugin()` |

**Output format** for `list`:
```
NAME                    MARKETPLACE          VERSION  STATUS
spex@cc-rhuss           cc-rhuss-marketplace 1.2.0    enabled
formatter@my-mkt        my-marketplace       unknown  disabled
```

### Update `index.ts`

```typescript
import { pluginCommand } from "./commands/plugin.js"
// In routing:
if (subcommand === "plugin") {
  pluginCommand(args.slice(1)).catch((err) => {
    console.error(`Error: ${err instanceof Error ? err.message : String(err)}`)
    process.exit(1)
  })
  return
}
```

---

## Phase 7: Slash Command Integration

### Update `skills/router.ts`

Add `"plugin"` routing before the skill lookup:

```typescript
// After INTERNAL_COMMANDS check, before loadSkills():
if (commandName === "plugin" || commandName.startsWith("plugin ")) {
  const subArgs = args  // everything after /plugin
  const output = await handlePluginSlashCommand(subArgs)
  return { kind: "internal", output }
}
```

```typescript
async function handlePluginSlashCommand(args: string): Promise<string>
// Parse args string: "marketplace add rhuss/cc-rhuss-marketplace"
// Dispatch to same functions as CLI plugin command
// Return formatted string output (not sent to AI)
```

Supported slash subcommands (per FR-025):
`marketplace add`, `marketplace list`, `marketplace remove`, `marketplace update`,
`install`, `uninstall`, `update`, `list`, `enable`, `disable`

---

## Phase 8: Agent Integration & Plugin Loading at Startup

### `Agent` class changes (`agent.ts`)

```typescript
class Agent {
  private hookRegistry: HookRegistry = new HookRegistry()
  private pluginSkills: PluginSkillEntry[] = []

  async initialize(): Promise<void>
  // loadInstalledPlugins() → for each plugin:
  //   hookRegistry.registerAll(plugin.hookEntries)
  //   pluginSkills.push(...plugin.skills)
}
```

**`createAgent()` factory**: call `agent.initialize()` before returning.

### Update skill loading call sites

**`App.tsx`** (after loadSkills):
```typescript
const allSkills = mergePluginSkills(await loadSkills(globalDir, projectDir), agent.getPluginSkills())
```

**`messages.ts`** (API): same pattern.

**`router.ts`**: `routeCommand()` gains optional `pluginSkills` param, merged before lookup.

---

## Verification

### Unit Tests (run with `bun test`)

1. **`manifest.test.ts`**: valid plugin.json, missing → fallback name, invalid JSON → throw
2. **`storage.test.ts`**: write/read round-trip, corrupted file → empty result
3. **`hooks.test.ts`**: fire event, matcher filtering, non-zero exit → warning not throw, 10s timeout
4. **`loader.test.ts`**: `mergePluginSkills` priority (plugin loses to global/project)
5. **`marketplace.test.ts`**: add with mock git, remove cascades to uninstall

### Integration Test

```bash
# 1. Create a local test marketplace
mkdir -p /tmp/test-mkt/.chloe-plugin
# write marketplace.json + a plugin with a SKILL.md and a PostToolUse hook

# 2. Install it
chloe plugin marketplace add --from-dir /tmp/test-mkt
chloe plugin install test-skill@test-mkt

# 3. Verify skill available
chloe plugin list   # shows test-skill enabled

# 4. Start chat, invoke skill
# /test-skill → AI receives skill content

# 5. Invoke write_file tool → hook log file created
```

### Regression Check

```bash
bun test packages/core/src/skills/  # all 012-skill-system tests pass
bunx biome check --error-on-warnings .
bunx tsc --noEmit -p tsconfig.check.json
```
