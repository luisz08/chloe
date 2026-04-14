# Feature Specification: Global Config via ~/.chloe/settings/config.toml

**Feature Branch**: `003-global-config`
**Created**: 2026-04-14
**Status**: Draft
**Input**: Replace manual env var setup with a persistent config file, with env var override support and a `chloe config` CLI subcommand. Reorganize `~/.chloe/` by purpose.

---

## Problem

Starting Chloe requires setting environment variables on every shell session (e.g. `CHLOE_API_KEY=sk-...`). This is tedious for personal daily use. The `~/.chloe/` directory already exists for the database; it should hold configuration too, with files organized by purpose.

---

## Directory Layout

```
~/.chloe/
├── sessions/          # SQLite databases (one per named session, or a shared db)
│   └── chloe.db
└── settings/          # User configuration
    └── config.toml
```

All subdirectories are created automatically on first use.

---

## Solution Overview

1. Reorganize `~/.chloe/` into purpose-based subdirectories.
2. Load config from `~/.chloe/settings/config.toml` at startup.
3. Env vars (`CHLOE_*`) override file values (env → file → built-in defaults).
4. On first run with no API key available, direct user to `chloe config init`.
5. Add `chloe config` CLI subcommand for reading and writing config.

---

## Config File

**Path**: `~/.chloe/settings/config.toml`  
**Permissions**: Created with mode `0600` (owner read/write only).

```toml
[provider]
api_key   = "sk-ant-..."           # required; no default
name      = "anthropic"            # optional; default: "anthropic"
model     = "claude-sonnet-4-6"    # optional; default: "claude-sonnet-4-6"
base_url  = ""                     # optional; default: "" (SDK default)

[storage]
db_path   = ""                     # optional; default: "~/.chloe/sessions/chloe.db"
```

Fields with empty or absent values fall through to built-in defaults.

---

## Priority / Override Chain

```
CHLOE_* env var  >  ~/.chloe/settings/config.toml  >  built-in default
```

| Config key         | Env var override  | Built-in default          |
|--------------------|-------------------|---------------------------|
| `provider.api_key` | `CHLOE_API_KEY`   | *(none — required)*       |
| `provider.name`    | `CHLOE_PROVIDER`  | `"anthropic"`             |
| `provider.model`   | `CHLOE_MODEL`     | `"claude-sonnet-4-6"`     |
| `provider.base_url`| `CHLOE_BASE_URL`  | `""` (SDK default)        |
| `storage.db_path`  | `CHLOE_DB_PATH`   | `~/.chloe/sessions/chloe.db` |

---

## User Scenarios & Testing

### User Story 1 — Config file replaces env vars (Priority: P1)

A user sets `api_key` in `~/.chloe/settings/config.toml`, then runs `chloe chat` without any env vars set. The session starts successfully.

**Acceptance Scenarios**:

1. **Given** `~/.chloe/settings/config.toml` has a valid `provider.api_key`, **When** `chloe chat` is run with no `CHLOE_*` env vars, **Then** the agent starts normally.
2. **Given** config file has `provider.model = "claude-haiku-4-5-20251001"`, **When** `chloe chat` runs, **Then** the specified model is used.
3. **Given** both `CHLOE_MODEL=claude-opus-4-6` env var and `provider.model = "claude-haiku-4-5-20251001"` in config, **When** `chloe chat` runs, **Then** the env var wins and `claude-opus-4-6` is used.

---

### User Story 2 — First-run prompt (Priority: P1)

A user installs Chloe for the first time and runs `chloe chat`. No config file and no `CHLOE_API_KEY` exist.

**Acceptance Scenarios**:

1. **Given** no config file and no `CHLOE_API_KEY` env var, **When** `chloe chat` is run, **Then** an error message explains the situation and instructs the user to run `chloe config init`.
2. **Given** `chloe config init` is run interactively, **Then** it prompts for `api_key` (required), `model` (optional, shows default), and `provider name` (optional, shows default), then writes `~/.chloe/settings/config.toml` with mode `0600`.
3. **Given** `~/.chloe/settings/` does not exist, **When** `chloe config init` runs, **Then** the directory is created before writing the file.

---

### User Story 3 — `chloe config` CLI subcommand (Priority: P2)

A user manages config values from the terminal without manually editing TOML.

**Acceptance Scenarios**:

1. **Given** a config file exists, **When** `chloe config show` is run, **Then** all config values are printed with secret fields (e.g. `api_key`) masked — show only the first 8 chars then `***` (e.g. `sk-ant-a***`).
2. **Given** no config file exists, **When** `chloe config show` is run, **Then** all fields are shown with their effective values (defaults or env var overrides), and a note indicates no config file was found.
3. **Given** a config file exists, **When** `chloe config get provider.model` is run, **Then** the current effective value (after env override) is printed.
4. **Given** `chloe config get provider.nonexistent` is run, **Then** an error is returned listing valid keys.
5. **Given** a config file exists, **When** `chloe config set provider.model claude-opus-4-6` is run, **Then** `~/.chloe/settings/config.toml` is fully rewritten (comments not preserved) and a success message is shown.
6. **Given** a non-existent key like `chloe config set foo.bar baz`, **Then** an error is returned listing valid keys.
7. **Given** `chloe config init` is run but a config already exists, **Then** the user is warned and asked to confirm before overwriting.

---

## Implementation Notes

### New module: `packages/core/src/config.ts`

Exports a single `loadConfig()` function:

```typescript
interface ChloeConfig {
  provider: {
    apiKey: string;
    name: string;
    model: string;
    baseUrl: string;
  };
  storage: {
    dbPath: string;
  };
}

function loadConfig(): ChloeConfig
```

Logic:
1. Read `~/.chloe/settings/config.toml` if it exists (use a TOML parser — `smol-toml` is zero-dep and Bun-compatible).
2. If the file exists but contains invalid TOML, throw immediately with a clear parse error message and the file path.
3. Merge with env vars (env wins).
4. Apply built-in defaults for missing values.
5. Return the merged config. **Do NOT throw on missing `api_key` here** — callers that require it (e.g. `chat`, `serve`) validate and throw themselves. Commands like `chloe config init` and `chloe config show` must work without an api_key present.

### Refactor existing code

Replace all direct `process.env.CHLOE_*` reads in:
- `packages/api/src/index.ts`
- `packages/cli/src/commands/chat.ts`
- `packages/cli/src/commands/sessions.ts`

...with a single `loadConfig()` call.

### New command: `packages/cli/src/commands/config.ts`

Subcommands: `init`, `show`, `get <key>`, `set <key> <value>`.  
Register as `chloe config` in `packages/cli/src/index.ts`.

### Valid settable keys

```
provider.api_key
provider.name
provider.model
provider.base_url
storage.db_path
```

---

## Migration: Existing `~/.chloe/chloe.db`

Users upgrading from a prior version may have `~/.chloe/chloe.db` at the old flat path.

**Detection**: at startup, before opening the database, check if `~/.chloe/chloe.db` exists AND `~/.chloe/sessions/chloe.db` does NOT exist.

**Behavior**: auto-migrate by moving the file.

```
~/.chloe/chloe.db  →  ~/.chloe/sessions/chloe.db
```

Steps:
1. Create `~/.chloe/sessions/` if it does not exist.
2. Move (rename) `~/.chloe/chloe.db` to `~/.chloe/sessions/chloe.db`.
3. Print a one-time notice: `Migrated database to ~/.chloe/sessions/chloe.db`.

**If both paths exist** (e.g. user manually created the new path): skip migration silently, use `~/.chloe/sessions/chloe.db`.

**Acceptance Scenarios**:

1. **Given** `~/.chloe/chloe.db` exists and `~/.chloe/sessions/chloe.db` does not, **When** `chloe` starts, **Then** the file is moved automatically and a notice is printed.
2. **Given** both paths exist, **When** `chloe` starts, **Then** `~/.chloe/sessions/chloe.db` is used and `~/.chloe/chloe.db` is left untouched.
3. **Given** neither path exists (fresh install), **When** `chloe` starts, **Then** `~/.chloe/sessions/` is created and a new database is initialized there.

---

## Out of Scope (this iteration)

- Multiple profiles (`~/.chloe/profiles/`)
- Encrypted secret storage
- Config schema validation beyond known keys
- `chloe config unset <key>` (manual edit is sufficient for now)
