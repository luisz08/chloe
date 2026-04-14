# Tasks: Global Config — 003-global-config

**Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

---

## Task 1 — Add `smol-toml` dependency

**Files**: `packages/core/package.json`  
**Work**: Add `smol-toml` as a runtime dependency in `packages/core`.  
**Done when**: `bun add smol-toml` succeeds; package.json updated; `bun test` passes.

---

## Task 2 — Implement `packages/core/src/config.ts`

**Files**: `packages/core/src/config.ts` (new)  
**Work**:
- Define `ChloeConfig`, `ProviderConfig`, `StorageConfig` interfaces
- Implement `loadConfig()` as a **synchronous** function (no async/Promise — startup code, all ops use `readFileSync`/`existsSync`/`renameSync`):
  1. Read `~/.chloe/settings/config.toml` via `readFileSync` if `existsSync` returns true
  2. Parse with `smol-toml.parse()`; throw on invalid TOML with path in message
  3. Merge env vars over file values (env wins per key)
  4. Apply built-in defaults for empty/missing values
  5. Expand `~` in `dbPath` to `homedir()`
  6. Run `migrateDb(dbPath)` before returning
  7. Return `ChloeConfig` — do NOT throw on empty `api_key`
- **Always** call `mkdirSync(dirname(resolvedDbPath), { recursive: true })` unconditionally (creates `~/.chloe/sessions/` on fresh installs too)
- Implement `migrateDb(resolvedDbPath: string)`:
  1. Check if `~/.chloe/chloe.db` exists AND `resolvedDbPath` does not
  2. If so: `renameSync(old, resolvedDbPath)` + print notice (dir already created above)
- Implement `maskSecret(value: string): string`: first 8 chars + `***`; if shorter than 8 chars, return `***`
- Implement `expandHome(p: string): string`: replace leading `~` with `homedir()`

**Done when**: TypeScript compiles; Biome passes; unit tests (Task 3) pass.

---

## Task 3 — Unit tests for `config.ts`

**Files**: `tests/unit/config.test.ts` (new)  
**Work**: Test all critical paths in `loadConfig()`, `migrateDb()`, `maskSecret()`:
- No config file, no env vars → all defaults returned; `api_key` is `""`
- Config file sets `provider.api_key` → returned in config
- Env var `CHLOE_MODEL` overrides `provider.model` in file
- Invalid TOML in config file → throws with file path in message
- `migrateDb`: old path exists, new does not → renamed; notice printed
- `migrateDb`: both paths exist → no rename; new path used
- `migrateDb`: neither exists → no-op
- `maskSecret("sk-ant-abcdefghij")` → `"sk-ant-a***"`
- `maskSecret("short")` → `"***"`

**Done when**: `bun test tests/unit/config.test.ts` passes; Biome passes.

---

## Task 4 — Export config symbols from `packages/core/src/index.ts`

**Files**: `packages/core/src/index.ts`  
**Work**: Add exports for `loadConfig`, `ChloeConfig`, `maskSecret`.  
**Done when**: TypeScript compiles; existing exports unchanged.

---

## Task 5 — Implement `packages/cli/src/commands/config.ts`

**Files**: `packages/cli/src/commands/config.ts` (new)  
**Work**: Implement `configCommand(subcommand, args)`:
- `init`: interactive readline prompts → write TOML via `smol-toml.stringify()` → `fs.chmodSync(path, 0o600)`; confirm before overwriting existing file
- `show`: call `loadConfig()` → format all keys with source annotation and masking
- `get <key>`: call `loadConfig()` → print raw value; validate key against allowlist
- `set <key> <value>`: read existing TOML (or empty object), update key, `stringify()`, write, chmod; validate key

**Valid keys allowlist**: `provider.api_key`, `provider.name`, `provider.model`, `provider.base_url`, `storage.db_path`

**Done when**: TypeScript compiles; Biome passes; manual smoke tests from quickstart.md work.

---

## Task 6 — Register `config` subcommand in CLI entry point

**Files**: `packages/cli/src/index.ts`  
**Work**:
- Import `configCommand` from `./commands/config.js`
- Add `if (subcommand === "config")` branch before the `CHLOE_API_KEY` guard
- Move the `CHLOE_API_KEY` guard to after the `config` branch (so `chloe config init` works without a key)
- Update the "subcommand required" error message to include `config`

**Done when**: `chloe config init` runs without requiring `CHLOE_API_KEY`; TypeScript compiles; Biome passes.

---

## Task 7 — Refactor `packages/cli/src/commands/chat.ts`

**Files**: `packages/cli/src/commands/chat.ts`  
**Work**: Replace direct `process.env.CHLOE_*` reads with a single `loadConfig()` call. Validate `apiKey` is non-empty and exit with clear message if not.  
**Done when**: TypeScript compiles; Biome passes; `chloe chat` still works with config file.

---

## Task 8 — Refactor `packages/cli/src/commands/sessions.ts`

**Files**: `packages/cli/src/commands/sessions.ts`  
**Work**: Replace `process.env.CHLOE_DB_PATH` with `loadConfig().storage.dbPath`.  
**Done when**: TypeScript compiles; Biome passes.

---

## Task 9 — Refactor `packages/api/src/index.ts`

**Files**: `packages/api/src/index.ts`  
**Work**: Replace top-level `process.env.CHLOE_*` reads and the early-exit api_key guard with a single `loadConfig()` call. Validate `apiKey` is non-empty.  
**Done when**: TypeScript compiles; Biome passes; API server starts with config file in place.

---

## Task Order & Dependencies

```
Task 1 (smol-toml)
  └── Task 2 (config.ts)
        ├── Task 3 (unit tests)
        └── Task 4 (export from core)
              ├── Task 5 (config command)
              │     └── Task 6 (register in CLI)
              ├── Task 7 (refactor chat)
              ├── Task 8 (refactor sessions)
              └── Task 9 (refactor api)
```

Tasks 5–9 can all be parallelised after Task 4.
