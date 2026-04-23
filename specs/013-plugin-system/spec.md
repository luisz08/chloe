# Feature Specification: Plugin System

**Feature Branch**: `013-plugin-system`  
**Created**: 2026-04-20  
**Status**: Draft  

## Clarifications

### Session 2026-04-20

- Q: Can `PreToolUse` hooks block/cancel tool execution? → A: No — all hooks are notification-only; exit code never cancels tool execution (Option B).
- Q: Execution order when multiple plugins register for the same event? → A: Installation order (order in `installed.json`); first installed fires first (Option A).
- Q: Working directory (`cwd`) for hook scripts? → A: `process.cwd()` — the user's current working directory at chloe startup (Option A).
- Q: Does `UserPromptSubmit` fire before or after slash command routing? → A: Before — fires on all user input including `/plugin` commands, before routing (Option A).

## Overview

Add a plugin system to chloe that allows users to install extensions from GitHub repositories or local directories. Plugins are distributed through **marketplaces** (GitHub repos with a catalog file) and can contain skills, agents, hooks, and (future) MCP servers. The system mirrors Claude Code's plugin architecture closely.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Add a Marketplace (Priority: P1)

A user runs `/plugin marketplace add rhuss/cc-rhuss-marketplace` in the CLI chat (or `chloe plugin marketplace add rhuss/cc-rhuss-marketplace` from the terminal). Chloe clones the GitHub repo, reads `.chloe-plugin/marketplace.json`, registers the marketplace in `~/.chloe/plugins/known_marketplaces.json`, and confirms success.

**Why this priority**: Foundation — all other plugin operations depend on having a registered marketplace.

**Independent Test**: Run `chloe plugin marketplace add rhuss/cc-rhuss-marketplace`, then `chloe plugin marketplace list`. Verify the marketplace appears with name, source, and plugin count.

**Acceptance Scenarios**:

1. **Given** `rhuss/cc-rhuss-marketplace` is a valid public GitHub repo with `.chloe-plugin/marketplace.json`, **When** user runs `chloe plugin marketplace add rhuss/cc-rhuss-marketplace`, **Then** the marketplace is cloned, registered, and `chloe plugin marketplace list` shows it.
2. **Given** a local directory `./my-marketplace` with `.chloe-plugin/marketplace.json`, **When** user runs `chloe plugin marketplace add --from-dir ./my-marketplace`, **Then** the marketplace is registered pointing to the local path (no clone needed).
3. **Given** an invalid GitHub repo (404), **When** user runs `chloe plugin marketplace add bad/repo`, **Then** an error is shown and no marketplace is registered.
4. **Given** a marketplace is already registered, **When** user runs `chloe plugin marketplace add` for the same source, **Then** the command errors with "marketplace already registered" (no duplicate).

---

### User Story 2 - Install a Plugin from a Marketplace (Priority: P1)

A user runs `/plugin install spex@cc-rhuss-marketplace`. Chloe looks up `spex` in the registered `cc-rhuss-marketplace` catalog, resolves the plugin's source (relative path or external URL), copies it to `~/.chloe/plugins/cache/spex@cc-rhuss-marketplace/`, and activates it for the current and future sessions.

**Why this priority**: Core functionality — the plugin system has no value without install.

**Independent Test**: Add a marketplace, install a plugin, then verify: (a) the plugin directory exists in cache, (b) any skills in the plugin are available as `/skill-name`, (c) `chloe plugin list` shows the plugin as installed and enabled.

**Acceptance Scenarios**:

1. **Given** `spex` exists in `cc-rhuss-marketplace`, **When** user runs `chloe plugin install spex@cc-rhuss-marketplace`, **Then** plugin is copied to cache, skills become available, plugin appears in `chloe plugin list`.
2. **Given** an already-installed plugin, **When** user runs `chloe plugin install` again, **Then** command errors with "already installed" and no duplicate is created.
3. **Given** a plugin name that doesn't exist in the marketplace, **When** user runs `chloe plugin install unknown@cc-rhuss-marketplace`, **Then** an error lists available plugins.
4. **Given** a marketplace that hasn't been added yet, **When** user runs `chloe plugin install spex@unknown-marketplace`, **Then** an error says the marketplace is not registered.

---

### User Story 3 - Plugin Skills Are Available After Install (Priority: P1)

After installing a plugin that contains a `skills/spex/SKILL.md`, the user can invoke `/spex` in chloe chat. The skill is loaded from the plugin cache and merged with global and project skills.

**Why this priority**: Without this, plugins have no visible effect.

**Independent Test**: Install a plugin with a known skill, restart chloe chat, type `/skill-name`, verify the AI receives the expanded skill content.

**Acceptance Scenarios**:

1. **Given** an installed plugin with `skills/review/SKILL.md`, **When** user types `/review`, **Then** the skill content is loaded and sent to AI (with `$ARGUMENTS` substituted).
2. **Given** a plugin skill and a global skill with the same name, **When** user types `/skill-name`, **Then** global `~/.chloe/skills/` takes priority over plugin skills (user skills override plugin skills).
3. **Given** a plugin with `commands/deploy.md` (flat format), **When** user types `/deploy`, **Then** it works the same as a skill directory.

---

### User Story 4 - Hook Execution (Priority: P2)

A plugin contains `hooks/hooks.json` with a `PostToolUse` hook that runs a shell script after every file write. After installing the plugin, chloe executes the hook script at the appropriate lifecycle event.

**Why this priority**: Hooks enable automation workflows — a key plugin capability.

**Independent Test**: Install a plugin with a `PostToolUse` hook that appends to a log file. Run chloe, invoke a tool write. Verify the log file has an entry.

**Acceptance Scenarios**:

1. **Given** a plugin with a `SessionStart` hook command, **When** a chloe session starts, **Then** the hook command executes (with `CHLOE_PLUGIN_ROOT` env var set to the plugin cache dir).
2. **Given** a plugin with a `PostToolUse` hook with `matcher: "write_file"`, **When** the `write_file` tool is called, **Then** the hook command executes after the tool completes.
3. **Given** a hook command that exits non-zero, **When** the hook fires, **Then** chloe logs a warning but does NOT abort the session.
4. **Given** a plugin is disabled, **When** a lifecycle event fires, **Then** that plugin's hooks do NOT execute.

---

### User Story 5 - CLI Plugin Management (Priority: P2)

A user manages plugins entirely from the terminal without entering a chat session.

**Why this priority**: Scripting and automation require non-interactive management.

**Independent Test**: Run `chloe plugin install`, `chloe plugin list`, `chloe plugin disable`, `chloe plugin enable`, `chloe plugin uninstall` in sequence. Verify state changes are reflected in `chloe plugin list` output and in `~/.chloe/plugins/installed.json`.

**Acceptance Scenarios**:

1. `chloe plugin list` shows all installed plugins with name, marketplace, version, and enabled/disabled status.
2. `chloe plugin disable spex@cc-rhuss-marketplace` marks the plugin as disabled; its skills and hooks no longer activate in new sessions.
3. `chloe plugin enable spex@cc-rhuss-marketplace` re-enables a disabled plugin.
4. `chloe plugin uninstall spex@cc-rhuss-marketplace` removes the plugin from cache and from `installed.json`.
5. `chloe plugin update spex@cc-rhuss-marketplace` refreshes the marketplace and re-copies the plugin if a newer version exists.

---

### User Story 6 - Slash Command Plugin Management (Priority: P3)

A user manages plugins from within a chloe chat session using `/plugin` slash commands.

**Why this priority**: UX convenience — power users stay in chat.

**Independent Test**: In a live chat session, type `/plugin marketplace add rhuss/cc-rhuss-marketplace`, then `/plugin install spex@cc-rhuss-marketplace`, then `/plugin list`. Verify responses are shown inline and state is persisted.

**Acceptance Scenarios**:

1. `/plugin marketplace add rhuss/cc-rhuss-marketplace` → adds marketplace, shows confirmation.
2. `/plugin install spex@cc-rhuss-marketplace` → installs plugin, shows confirmation with skill list.
3. `/plugin list` → shows installed plugins table.
4. `/plugin uninstall spex@cc-rhuss-marketplace` → removes plugin, shows confirmation.
5. `/plugin marketplace list` → shows all registered marketplaces.

---

### Edge Cases

- Plugin with no `.chloe-plugin/plugin.json` → auto-discover skills from `skills/` and `commands/` directories; use directory name as plugin name.
- Plugin skill name conflicts with built-in internal commands (`/help`, `/reload-skills`) → internal commands always win; plugin skill is shadowed (warn on install).
- Hook script is not executable → warn at install time; skip at runtime.
- GitHub clone fails mid-way → clean up partial clone; surface error; no partial state left in `installed.json`.
- Plugin with `agents/` directory (future) → parse and store, but skip activation with a "not yet supported" log line.
- MCP servers in plugin → parse `.mcp.json` but skip with a "not yet supported" log line.
- Marketplace `marketplace.json` is malformed JSON → error with line/column; no partial registration.

---

## Requirements *(mandatory)*

### Functional Requirements

**Marketplace Management**

- **FR-001**: `chloe plugin marketplace add <github-owner/repo>` MUST: (1) clone the repo to a temp directory, (2) read the `name` field from `.chloe-plugin/marketplace.json`, (3) move the clone to `~/.chloe/plugins/marketplaces/<name>/`, (4) register it in `~/.chloe/plugins/known_marketplaces.json`. On any failure, the temp clone MUST be cleaned up and nothing written to the registry.
- **FR-002**: `chloe plugin marketplace add --from-dir <path>` MUST register a local directory as a marketplace without cloning (use absolute path in registry).
- **FR-003**: Marketplace catalog MUST be read from `.chloe-plugin/marketplace.json` at the repo/dir root. The `name` field in that file is the marketplace's canonical name.
- **FR-004**: `chloe plugin marketplace list` MUST display all registered marketplaces with name, source, and plugin count.
- **FR-005**: `chloe plugin marketplace remove <name>` MUST unregister the marketplace and uninstall all plugins sourced from it.
- **FR-006**: `chloe plugin marketplace update [name]` MUST `git pull` the marketplace repo(s) and refresh the local catalog.

**Plugin Installation**

- **FR-007**: `chloe plugin install <name@marketplace>` MUST locate the plugin entry in the marketplace catalog, resolve its source, and copy the plugin directory to `~/.chloe/plugins/cache/<name>@<marketplace>/`.
- **FR-008**: Plugin sources MUST support: relative path within the marketplace repo (`./plugins/spex`), and GitHub repo (`{ "source": "github", "repo": "owner/repo" }`).
- **FR-009**: `chloe plugin uninstall <name@marketplace>` MUST remove the plugin from cache and from `installed.json`.
- **FR-010**: `chloe plugin list` MUST show all installed plugins with: name, marketplace, version (from `plugin.json` or `"unknown"`), enabled status.
- **FR-011**: `chloe plugin enable <name@marketplace>` and `chloe plugin disable <name@marketplace>` MUST toggle the plugin's enabled flag in `installed.json` without removing it from cache.
- **FR-012**: `chloe plugin update <name@marketplace>` MUST refresh the marketplace, then re-copy the plugin if the version in `plugin.json` differs from the installed version.

**Plugin Loading**

- **FR-013**: At agent startup, the system MUST load all enabled installed plugins from `~/.chloe/plugins/cache/`.
- **FR-014**: Plugin skills (from `skills/<name>/SKILL.md` and `commands/<name>.md`) MUST be merged with global and project skills. Priority order (highest first): project skills > global skills > plugin skills.
- **FR-015**: Plugin hooks (from `hooks/hooks.json`) MUST be registered in the `HookRegistry` at session start.
- **FR-016**: The env var `CHLOE_PLUGIN_ROOT` MUST be set to the plugin's cache directory when executing hook commands. Hook scripts MUST run with `cwd` set to `process.cwd()` (the user's working directory at chloe startup), not the plugin directory.
- **FR-017**: Agents in `agents/` and MCP servers in `.mcp.json` MUST be parsed but NOT activated (log "not yet supported" at debug level).

**Hook System**

- **FR-018**: A `HookRegistry` MUST support registering hooks for these events: `SessionStart`, `SessionEnd`, `PreToolUse`, `PostToolUse`, `UserPromptSubmit`.
- **FR-019**: Hook entries MUST support a `matcher` field (exact tool name string, or `*` to match all tools) to filter which tool names trigger `PreToolUse`/`PostToolUse` hooks. If `matcher` is absent, the hook fires for all tools.
- **FR-020**: Hook commands MUST be executed as shell subprocesses; stdout/stderr MUST be captured and logged at debug level.
- **FR-021**: Hook command failures (non-zero exit) MUST be logged as warnings but MUST NOT abort the agent loop or propagate as errors.
- **FR-021b**: All hook events (including `PreToolUse`) are notification-only. A hook's exit code NEVER cancels or skips tool execution. `HookRegistry.fire()` is always fire-and-forget from the perspective of the caller.
- **FR-021c**: When multiple plugins register hooks for the same event, hooks MUST execute sequentially in the order plugins appear in `installed.json` (installation order). Each hook runs to completion (or timeout) before the next starts.
- **FR-022**: The agent `runLoop` MUST call `HookRegistry.fire("PreToolUse", ...)` before tool execution and `HookRegistry.fire("PostToolUse", ...)` after.
- **FR-023**: The agent startup MUST call `HookRegistry.fire("SessionStart", ...)` and session teardown MUST call `HookRegistry.fire("SessionEnd", ...)`.
- **FR-023b**: `UserPromptSubmit` MUST fire on every user input BEFORE slash command routing. It fires for `/plugin` commands, skill invocations, and plain messages alike.

**Slash Command Integration**

- **FR-024**: `/plugin` MUST be recognized as an internal command family in the command router.
- **FR-025**: The following `/plugin` subcommands MUST work in chat: `marketplace add`, `marketplace list`, `marketplace remove`, `marketplace update`, `install`, `uninstall`, `update`, `list`, `enable`, `disable`.
- **FR-026**: `/plugin` responses MUST be printed as inline text (not sent to AI).

### Non-Functional Requirements

- **NFR-001**: Marketplace clone (`git clone`) MUST complete within 30 seconds or be killed and treated as failure.
- **NFR-002**: Plugin loading at startup (scanning cache + reading manifests) MUST complete in under 200ms for up to 20 installed plugins.
- **NFR-003**: All hook events fire asynchronously — chloe does NOT await hook completion before continuing. `PreToolUse` fires and chloe immediately proceeds to tool execution; `PostToolUse` and `SessionEnd` fire without waiting. Hook exit codes are never checked for flow control.
- **NFR-003b**: Each hook command MUST be killed after 10 seconds if still running. Timeout is logged as a warning.
- **NFR-004**: All plugin state (`known_marketplaces.json`, `installed.json`) MUST be valid JSON; corrupted files MUST produce a clear error message pointing to the file path.

### Key Entities

- **Marketplace**: A registered plugin catalog. Attributes: `name`, `source` (`github` | `local`), `repo` or `path`, `cloneDir`, `plugins[]`.
- **MarketplaceManifest** (`marketplace.json`): `{ name, owner, plugins: [{ name, source, description, version }] }`.
- **Plugin**: An installed extension. Attributes: `name`, `marketplace`, `version`, `enabled`, `cacheDir`.
- **PluginManifest** (`plugin.json`): `{ name, version, description, author, skills?, commands?, agents?, hooks? }`.
- **PluginSkill**: A skill loaded from a plugin. Same as `Skill` but with `source: "plugin"` and `pluginId`.
- **HookRegistry**: Singleton that stores hook registrations and fires them by event name.
- **HookEntry**: `{ event, matcher?, type: "command", command }`.
- **InstalledPluginRecord**: Persisted in `installed.json`: `{ id, name, marketplace, version, enabled, cacheDir, installedAt }`.

---

## File & Directory Structure

### Runtime Storage

```
~/.chloe/plugins/
├── known_marketplaces.json     # Registered marketplaces
├── installed.json              # Installed plugin records
├── marketplaces/
│   └── cc-rhuss-marketplace/   # git clone of marketplace repo
│       └── .chloe-plugin/
│           └── marketplace.json
└── cache/
    └── spex@cc-rhuss-marketplace/
        ├── .chloe-plugin/
        │   └── plugin.json
        ├── skills/
        │   └── spex/
        │       └── SKILL.md
        ├── commands/
        ├── agents/             # parsed but not activated
        └── hooks/
            └── hooks.json
```

### Plugin Format

```
my-plugin/
├── .chloe-plugin/
│   └── plugin.json
├── skills/
│   └── skill-name/
│       └── SKILL.md
├── commands/
│   └── cmd-name.md
├── agents/
│   └── agent-name.md          # future
├── hooks/
│   └── hooks.json
└── scripts/
    └── post-write.sh
```

### Marketplace Format

```
my-marketplace/
├── .chloe-plugin/
│   └── marketplace.json
└── plugins/
    └── spex/
        ├── .chloe-plugin/
        │   └── plugin.json
        └── skills/
```

---

## Success Criteria *(mandatory)*

- **SC-001**: `chloe plugin marketplace add rhuss/cc-rhuss-marketplace` succeeds for a real public GitHub repo and the marketplace appears in `chloe plugin marketplace list`.
- **SC-002**: `chloe plugin install spex@cc-rhuss-marketplace` installs a plugin and `/spex` is available in the next chat session.
- **SC-003**: Plugin skills have lower priority than global `~/.chloe/skills/` skills (verified by name collision test).
- **SC-004**: A `PostToolUse` hook shell command executes within 1 second of a matching tool call completing.
- **SC-005**: `chloe plugin disable` prevents plugin skills and hooks from activating in new sessions.
- **SC-006**: Plugin loading for 10 installed plugins adds less than 200ms to session startup.
- **SC-007**: All existing tests in `012-skill-system` continue to pass (no regression in skill loading).
- **SC-008**: `/plugin marketplace add` and `/plugin install` work correctly from within a live chat session.

---

## Assumptions

- Git is available in `$PATH` on all supported platforms.
- GitHub repos are public (no auth required for clone). Private repo support is out of scope for this spec.
- Plugin hook scripts must be made executable by the plugin author (`chmod +x`); chloe does not set permissions automatically.
- MCP server and agent activation are explicitly deferred to a future spec.
- The `known_marketplaces.json` and `installed.json` files are owned by the user; concurrent writes from multiple chloe instances are not handled (last-write-wins).
- Plugin names are globally unique within a marketplace; the composite key `name@marketplace` is unique across all installed plugins.
- Skills loaded from plugins use the same `SKILL.md` frontmatter format as existing global skills.
