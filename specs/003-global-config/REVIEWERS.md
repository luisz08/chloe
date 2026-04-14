# Review Guide: Global Config — 003-global-config

This document guides reviewers of the `003-global-config` feature branch.

---

## What This Feature Does

Adds `~/.chloe/settings/config.toml` as a persistent configuration store so users no longer need to set `CHLOE_*` env vars on every shell session. Env vars still override file values. Adds a `chloe config` CLI subcommand (init/show/get/set). Automatically migrates `~/.chloe/chloe.db` → `~/.chloe/sessions/chloe.db`.

---

## Key Files to Review

| File | Why |
|------|-----|
| `packages/core/src/config.ts` | Core logic — priority merge, migration, masking |
| `packages/core/src/index.ts` | Exports added |
| `packages/cli/src/commands/config.ts` | New CLI subcommand |
| `packages/cli/src/index.ts` | `config` branch placement relative to api_key guard |
| `packages/cli/src/commands/chat.ts` | Env var reads replaced with `loadConfig()` |
| `packages/api/src/index.ts` | Env var reads replaced; top-level guard removed |
| `tests/unit/config.test.ts` | Coverage of all edge cases |

---

## Priority Merge Logic (Most Critical)

**Spec**: env var > config file > built-in default.

Check in `packages/core/src/config.ts`:
- Every `CHLOE_*` env var overrides its corresponding TOML field
- Empty string in env var (`CHLOE_MODEL=""`) should NOT override — only non-empty env vars win
- Missing TOML field falls through to default (not to empty string)

---

## Security: File Permissions

`~/.chloe/settings/config.toml` must be created with mode `0600`.  
Verify `fs.chmodSync(path, 0o600)` is called after **every** write path:
- `chloe config init`
- `chloe config set`

---

## Migration Safety

`migrateDb()` must:
1. Only move the old file when new path does NOT exist
2. Never delete the old file on conflict (both-exist case)
3. Print a notice (not an error) when migrating

Verify the both-paths-exist case is a no-op.

---

## `chloe config` Without API Key

`chloe config init`, `chloe config show`, `chloe config get`, `chloe config set` must all work **before** an API key is configured. Verify the `CHLOE_API_KEY` guard in `packages/cli/src/index.ts` comes **after** the `config` branch.

---

## `~/.chloe/sessions/` Creation

On a fresh install (no old DB, no new DB), `~/.chloe/sessions/` must be created unconditionally by `loadConfig()` so `SQLiteStorageAdapter` can open the file without a "directory not found" error. Verify `mkdirSync(..., { recursive: true })` is called on `dirname(dbPath)` in `loadConfig()`.

---

## Tests Checklist

All of these must have explicit test cases in `tests/unit/config.test.ts`:

- [ ] No config file, no env vars → all defaults; `api_key === ""`
- [ ] Config file with `provider.api_key` → returned
- [ ] Env var overrides file value
- [ ] Invalid TOML → throws with file path in message
- [ ] Migration: old path only → renamed, notice printed
- [ ] Migration: both paths → no rename
- [ ] Migration: neither path → no-op
- [ ] `maskSecret` on long key → `sk-ant-a***`
- [ ] `maskSecret` on short key → `***`

---

## Constitution Compliance

| Principle | Check |
|-----------|-------|
| Core-Library-First | All config logic in `packages/core`, not in CLI/API |
| Strict TypeScript | No `any`, no `as` casts outside system boundaries |
| DRY | No remaining `process.env.CHLOE_*` reads outside `packages/core/src/config.ts` |
| Unit Tests | Critical paths listed above are tested |
