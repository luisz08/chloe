# Data Model: Plugin System

## JSON File Schemas

### `~/.chloe/plugins/known_marketplaces.json`

```json
{
  "cc-rhuss-marketplace": {
    "name": "cc-rhuss-marketplace",
    "addedAt": "2026-04-20T14:00:00Z",
    "source": {
      "type": "github",
      "repo": "rhuss/cc-rhuss-marketplace"
    },
    "cloneDir": "/home/user/.chloe/plugins/marketplaces/cc-rhuss-marketplace"
  },
  "local-dev": {
    "name": "local-dev",
    "addedAt": "2026-04-20T15:00:00Z",
    "source": {
      "type": "local",
      "path": "/home/user/projects/my-marketplace"
    },
    "cloneDir": null
  }
}
```

### `~/.chloe/plugins/installed.json`

```json
{
  "spex@cc-rhuss-marketplace": {
    "id": "spex@cc-rhuss-marketplace",
    "name": "spex",
    "marketplace": "cc-rhuss-marketplace",
    "version": "1.2.0",
    "enabled": true,
    "cacheDir": "/home/user/.chloe/plugins/cache/spex@cc-rhuss-marketplace",
    "installedAt": "2026-04-20T14:05:00Z"
  }
}
```

### `.chloe-plugin/marketplace.json`

```json
{
  "name": "cc-rhuss-marketplace",
  "owner": {
    "name": "rhuss",
    "email": "rhuss@example.com"
  },
  "metadata": {
    "description": "Roland Huß's Claude Code plugin collection"
  },
  "plugins": [
    {
      "name": "spex",
      "source": "./plugins/spex",
      "description": "Spec-driven development tools",
      "version": "1.2.0"
    },
    {
      "name": "formatter",
      "source": {
        "source": "github",
        "repo": "rhuss/chloe-formatter-plugin"
      },
      "description": "Code formatting hooks"
    }
  ]
}
```

### `.chloe-plugin/plugin.json`

```json
{
  "name": "spex",
  "version": "1.2.0",
  "description": "Spec-driven development tools for chloe",
  "author": {
    "name": "rhuss"
  },
  "skills": "./skills/",
  "commands": "./commands/",
  "hooks": "./hooks/hooks.json"
}
```

### `hooks/hooks.json`

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "${CHLOE_PLUGIN_ROOT}/scripts/setup.sh"
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "write_file",
        "hooks": [
          {
            "type": "command",
            "command": "${CHLOE_PLUGIN_ROOT}/scripts/format.sh"
          }
        ]
      }
    ]
  }
}
```

## TypeScript Interfaces (in `packages/core/src/plugins/types.ts`)

```typescript
// Marketplace source
type MarketplaceSource =
  | { type: "github"; repo: string; ref?: string }
  | { type: "local"; path: string }

// Plugin source within a marketplace catalog
type PluginSource =
  | string                                              // relative path: "./plugins/spex"
  | { source: "github"; repo: string; ref?: string }

// Persisted marketplace registry entry
interface MarketplaceRecord {
  name: string
  addedAt: string            // ISO 8601
  source: MarketplaceSource
  cloneDir: string | null    // null for local source
}

// marketplace.json content
interface MarketplaceManifest {
  name: string
  owner: { name: string; email?: string }
  metadata?: { description?: string }
  plugins: MarketplacePluginEntry[]
}

interface MarketplacePluginEntry {
  name: string
  source: PluginSource
  description?: string
  version?: string
}

// plugin.json content
interface PluginManifest {
  name: string
  version?: string
  description?: string
  author?: { name: string; email?: string }
  skills?: string | string[]
  commands?: string | string[]
  agents?: string | string[]
  hooks?: string
}

// Persisted installed plugin record
interface InstalledPluginRecord {
  id: string                 // "name@marketplace"
  name: string
  marketplace: string
  version: string            // from plugin.json, or "unknown"
  enabled: boolean
  cacheDir: string           // absolute path
  installedAt: string        // ISO 8601
}

// Loaded plugin (runtime, after reading from cache)
interface LoadedPlugin {
  id: string
  manifest: PluginManifest
  cacheDir: string
  skills: PluginSkill[]
  hooks: HookEntry[]
}

interface PluginSkill {
  name: string
  content: string
  source: "plugin"
  pluginId: string
}

// Hook system
type HookEvent =
  | "SessionStart"
  | "SessionEnd"
  | "PreToolUse"
  | "PostToolUse"
  | "UserPromptSubmit"

interface HookEntry {
  event: HookEvent
  matcher?: string           // tool name pattern for PreToolUse/PostToolUse
  type: "command"
  command: string            // shell command with ${CHLOE_PLUGIN_ROOT} substitution
  pluginId: string           // which plugin registered this hook
}

interface HookContext {
  event: HookEvent
  toolName?: string          // for PreToolUse/PostToolUse
  sessionId: string
  pluginRoot: string         // CHLOE_PLUGIN_ROOT value
}
```

## Hook Event Payload (env vars passed to hook scripts)

| Variable | Description |
|----------|-------------|
| `CHLOE_PLUGIN_ROOT` | Absolute path to plugin cache dir |
| `CHLOE_HOOK_EVENT` | Event name (e.g. `PostToolUse`) |
| `CHLOE_TOOL_NAME` | Tool name (PreToolUse/PostToolUse only) |
| `CHLOE_SESSION_ID` | Current session ID |
