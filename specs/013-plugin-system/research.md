# Research: Plugin System

## Claude Code Plugin System (Reference)

Researched April 2026 from official docs at `code.claude.com/docs`.

### Plugin Format
- Plugin root has `.claude-plugin/plugin.json` (manifest) and component dirs at root level
- Skills: `skills/<name>/SKILL.md` (directory form) or `commands/<name>.md` (flat form)
- Hooks: `hooks/hooks.json` — JSON with event → hook entries
- MCP: `.mcp.json`
- Agents: `agents/<name>.md`
- `${CLAUDE_PLUGIN_ROOT}` env var available in hooks/MCP configs

### Marketplace Format
- Marketplace repo has `.claude-plugin/marketplace.json`
- Each plugin entry: `{ name, source, description, version }`
- Sources: relative path `"./plugins/spex"`, github `{ source: "github", repo }`, npm, git-subdir
- Users add via `/plugin marketplace add owner/repo`
- Users install via `/plugin install name@marketplace`

### Plugin Storage
- Marketplaces cloned to `~/.claude/plugins/marketplaces/`
- Plugins cached at `~/.claude/plugins/cache/<plugin>@<marketplace>/`
- Known marketplaces: `~/.claude/plugins/known_marketplaces.json`

### Hook Events
SessionStart, SessionEnd, PreToolUse, PostToolUse, UserPromptSubmit (and more)

### Hook Types
`command` (shell), `http` (POST webhook), `prompt` (LLM eval), `agent` (subagent)

---

## Chloe Codebase Research (April 2026)

### Skill Loader (`packages/core/src/skills/`)

**`Skill` interface** (`types.ts` lines 3-8):
```typescript
interface Skill {
  name: string;        // lowercase identifier, from filename
  content: string;     // raw markdown
  source: "global" | "project";
  description: string; // from frontmatter or first line
}
```

**`loadSkills(globalDir, projectDir)`** (`loader.ts` lines 41-46):
- Regex `/^[a-z0-9_-]+\.md$/` for file discovery
- Returns `[...globalMap, ...projectMap]` — project overwrites global on name collision
- Silently returns empty if directories don't exist

**`routeCommand(input, opts)`** (`router.ts` lines 42-77):
- Internal commands: `INTERNAL_COMMANDS = Set["help", "reload-skills"]` (line 40)
- Returns `CommandResult`: `skill | internal | reload-skills | error | passthrough`
- Skill lookup calls `loadSkills()` fresh each time

**Call sites**:
- `packages/cli/src/ui/App.tsx` — `loadSkills()` on mount, `routeCommand()` on input
- `packages/api/src/handlers/messages.ts` — `routeCommand()` per message

---

### Agent runLoop (`packages/core/src/agent/`)

**Tool execution site** (`loop.ts` line 127):
```typescript
const output = await tool.execute(toolInput, toolContext);  // line 127
```
- **PreToolUse fires just before line 127**
- **PostToolUse fires just after line 127** (in try block, before onToolResult callback)
- `callbacks.onToolResult?.()` fires at line 129 — PostToolUse fires BEFORE this

**Session lifecycle** (`agent.ts`):
- `Agent.run()` entry (~line 86) → **SessionStart**
- finally block (~lines 153-155) → **SessionEnd**
- `AgentCallbacks` fields: `onToken, onToolCall, onToolResult, confirmTool, confirmBashCommand, onUsage`

**`ToolContext`** (`tools/types.ts` lines 5-10):
```typescript
interface ToolContext { sessionId, storage, client, modelConfig }
```

**confirmTool pattern** (loop.ts lines 102-113): optional async callback, gates execution. HookRegistry follows same pattern but never gates.

---

### CLI Structure (`packages/cli/src/`)

**Arg parsing**: no library — manual `process.argv.slice(2)` in `index.ts`

**Routing pattern** (`index.ts`):
```typescript
const subcommand = args[0];
if (subcommand === "config") { configCommand(args.slice(1)).catch(...) }
if (subcommand === "sessions") { sessionsCommand({...}).catch(...) }
// etc.
```

**Nested subcommands**: each command file handles `args[0]` internally (see `config.ts` with `init/show/get/set`)

**Error pattern**: `console.error("Error: <msg>")` + `process.exit(1)`

**All commands**: `async function fooCommand(args: string[]): Promise<void>`

**Skills are CLI-only**: `App.tsx` calls `loadSkills()` / `routeCommand()` — not used in `index.ts`

---

### Config / Storage / Bun Patterns

**Home dir**: `expandHome()` in `config.ts` uses `homedir()` from `node:os`

**JSON I/O** (no central utility — use `recents.ts` pattern):
```typescript
// read
if (!existsSync(filePath)) return default;
try { return JSON.parse(readFileSync(filePath, "utf8")); } catch { return default; }

// write
writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
```

**Directory creation**: `mkdirSync(dirname(filePath), { recursive: true })` before every write

**Bun.spawn** (`tools/bash.ts` lines 64-113 — exact pattern for git):
```typescript
const proc = Bun.spawn(["git", "clone", url, dest], { cwd, stdout: "pipe", stderr: "pipe" });
const timer = setTimeout(() => { proc.kill(); }, timeoutMs);
const [stdout, stderr, exitCode] = await Promise.all([
  new Response(proc.stdout).text(),
  new Response(proc.stderr).text(),
  proc.exited,
]);
clearTimeout(timer);
// check exitCode
```

**All imports**: `node:fs` and `node:path` (not Bun.file)

---

## Design Decisions (Final)

1. `.chloe-plugin/` prefix — not `.claude-plugin/`
2. `CHLOE_PLUGIN_ROOT` env var in hook scripts
3. Hook system: only `command` type (shell scripts)
4. MCP + agent activation deferred to future spec
5. GitHub and local sources only (no npm)
6. Bun.spawn for git (mirrors bash.ts pattern exactly)
7. Skill priority: project > global > plugin (add as third tier)
8. HookRegistry: field on `Agent` class, populated during plugin loading
9. All hooks async / fire-and-forget; 10s timeout per hook script
10. Multiple plugins same event: sequential in installed.json order
11. Hook `matcher`: exact tool name string or `*` (no regex complexity)
12. `UserPromptSubmit`: fires in `App.tsx` handleSubmit BEFORE routeCommand
