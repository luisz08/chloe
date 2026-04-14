# CLI Contract: `chloe config` Subcommand

## Command Schema

```
chloe config <subcommand> [args]
```

---

## Subcommands

### `chloe config init`

Interactive setup wizard. Creates `~/.chloe/settings/config.toml`.

**Input**: stdin prompts (readline)  
**Prompts**:
```
API Key (required): 
Model [claude-sonnet-4-6]: 
Provider name [anthropic]: 
```
**Output on success**:
```
Config saved to ~/.chloe/settings/config.toml
```
**Side effects**:
- Creates `~/.chloe/settings/` if it does not exist
- Writes `~/.chloe/settings/config.toml` with mode `0600`

**Error cases**:
- Config already exists → prompt: `Config already exists. Overwrite? [y/N]: ` — if user types anything other than `y`/`Y`, exit 0 without writing

---

### `chloe config show`

Print all effective config values (file + env override + defaults applied).

**Output format**:
```
provider.api_key  = sk-ant-a***  [from file]
provider.name     = anthropic    [default]
provider.model    = claude-sonnet-4-6  [from env: CHLOE_MODEL]
provider.base_url =              [default]
storage.db_path   = /home/user/.chloe/sessions/chloe.db  [default]
```

**Rules**:
- Secret fields (`api_key`): masked as first 8 chars + `***`; if shorter than 8 chars, mask entirely as `***`
- Source annotation options: `[from file]`, `[from env: CHLOE_*]`, `[default]`
- If no config file exists: all values shown with their effective source, plus a notice line:
  ```
  Note: no config file found at ~/.chloe/settings/config.toml
  ```

---

### `chloe config get <key>`

Print the effective value for a single key (raw, unmasked).

**Args**: `<key>` — dotted path  
**Output**: raw string value, one line  
**Error cases**:
- Unknown key → stderr:
  ```
  Error: unknown config key 'foo.bar'
  Valid keys: provider.api_key, provider.name, provider.model, provider.base_url, storage.db_path
  ```
  Exit code 1

---

### `chloe config set <key> <value>`

Update a single config key. Full file rewrite (comments not preserved).

**Args**: `<key>` — dotted path; `<value>` — string  
**Output on success**:
```
Updated provider.model in ~/.chloe/settings/config.toml
```
**Side effects**:
- Creates `~/.chloe/settings/` if it does not exist
- Creates or rewrites `~/.chloe/settings/config.toml` with mode `0600`

**Error cases**:
- Unknown key → same error as `get`; exit 1
- File parse error on existing file → stderr with path and parse error; exit 1

---

## Valid Keys

```
provider.api_key
provider.name
provider.model
provider.base_url
storage.db_path
```

---

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success (including user-cancelled `init` overwrite) |
| 1 | Error: bad args, unknown key, parse error, I/O error |
