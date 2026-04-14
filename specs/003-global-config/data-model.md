# Data Model: Global Config — 003-global-config

## ChloeConfig (TypeScript Interface)

The central config type returned by `loadConfig()`.

```typescript
interface ProviderConfig {
  apiKey: string;   // required; empty string if not set — callers validate
  name: string;     // default: "anthropic"
  model: string;    // default: "claude-sonnet-4-6"
  baseUrl: string;  // default: "" (Anthropic SDK uses its own default)
}

interface StorageConfig {
  dbPath: string;   // default: expandHome("~/.chloe/sessions/chloe.db")
}

interface ChloeConfig {
  provider: ProviderConfig;
  storage: StorageConfig;
}
```

**Invariants**:
- All fields are always present in the returned object (no `undefined`)
- `provider.apiKey` may be empty — callers that need the API key validate themselves
- `storage.dbPath` is always an absolute path (tilde expanded by `loadConfig()`)

---

## Config File Schema (TOML)

```toml
[provider]
api_key   = ""   # string — maps to ChloeConfig.provider.apiKey
name      = ""   # string — maps to ChloeConfig.provider.name
model     = ""   # string — maps to ChloeConfig.provider.model
base_url  = ""   # string — maps to ChloeConfig.provider.baseUrl

[storage]
db_path   = ""   # string — maps to ChloeConfig.storage.dbPath
```

Fields are snake_case in TOML; camelCase in TypeScript. Conversion is explicit in `loadConfig()`.

---

## Env Var Mapping

| TOML key              | Env var          | Built-in default                     |
|-----------------------|------------------|--------------------------------------|
| `provider.api_key`    | `CHLOE_API_KEY`  | `""` (no default — required for API) |
| `provider.name`       | `CHLOE_PROVIDER` | `"anthropic"`                        |
| `provider.model`      | `CHLOE_MODEL`    | `"claude-sonnet-4-6"`                |
| `provider.base_url`   | `CHLOE_BASE_URL` | `""`                                 |
| `storage.db_path`     | `CHLOE_DB_PATH`  | `~/.chloe/sessions/chloe.db`         |

Priority: env var → config file → built-in default.

---

## File System Paths

| Path | Purpose | Created by |
|------|---------|-----------|
| `~/.chloe/` | Root data directory | Pre-existing |
| `~/.chloe/sessions/` | Database directory | `loadConfig()` on first use |
| `~/.chloe/sessions/chloe.db` | Default SQLite database | `SQLiteStorageAdapter` |
| `~/.chloe/settings/` | Config directory | `chloe config init` or `chloe config set` |
| `~/.chloe/settings/config.toml` | User config file | `chloe config init` or `chloe config set` |

---

## Migration State Machine

```
                    ┌─────────────────────────────┐
                    │  loadConfig() called          │
                    └──────────────┬──────────────┘
                                   │
                    ┌──────────────▼──────────────┐
                    │  ~/.chloe/chloe.db exists?   │
                    └──────────────┬──────────────┘
                          No ──────┘      │ Yes
                          │               ▼
                          │  ~/.chloe/sessions/chloe.db exists?
                          │         No ──────┐      │ Yes
                          │         │         │      ▼
                          │         ▼         │  skip migration
                          │  rename to        │  use sessions/chloe.db
                          │  sessions/chloe.db│
                          │  print notice     │
                          └──────────┬────────┘
                                     │
                              continue with dbPath
```
