# Contract: Model Configuration Format

**Feature**: 009-multi-model-routing
**Type**: Configuration Contract
**Date**: 2026-04-16

## TOML Configuration

**File**: `~/.chloe/settings/config.toml`

```toml
[provider]
api_key = "sk-ant-..."          # API key for Anthropic
name = "anthropic"               # Provider name (default: anthropic)
base_url = ""                    # Optional: custom API endpoint

# Model configuration (new format)
default_model = "claude-sonnet-4-6"      # Required - primary model
reasoning_model = "claude-opus-4-6"      # Optional - fallback to default_model
fast_model = "claude-haiku-4-5-20251001" # Optional - fallback to default_model
vision_model = "claude-sonnet-4-6"       # Optional - fallback to default_model

[storage]
db_path = "~/.chloe/sessions/chloe.db"

[logging]
log_dir = "./logs"
level = "info"
max_size_mb = 10
max_days = 7
```

## Environment Variables

| Env Var | TOML Equivalent | Priority | Description |
|---------|-----------------|----------|-------------|
| `CHLOE_API_KEY` | `provider.api_key` | Env > TOML | Anthropic API key |
| `CHLOE_PROVIDER` | `provider.name` | Env > TOML | Provider name |
| `CHLOE_BASE_URL` | `provider.base_url` | Env > TOML | Custom API endpoint |
| `CHLOE_DEFAULT_MODEL` | `provider.default_model` | Env > TOML | Primary model |
| `CHLOE_REASONING_MODEL` | `provider.reasoning_model` | Env > TOML | Reasoning model |
| `CHLOE_FAST_MODEL` | `provider.fast_model` | Env > TOML | Fast model |
| `CHLOE_VISION_MODEL` | `provider.vision_model` | Env > TOML | Vision model |
| `CHLOE_DB_PATH` | `storage.db_path` | Env > TOML | Database path |
| `CHLOE_LOG_DIR` | `logging.log_dir` | Env > TOML | Log directory |
| `CHLOE_LOG_LEVEL` | `logging.level` | Env > TOML | Log level |

## Fallback Resolution

**Order**:
1. Environment variable (if set and non-empty)
2. TOML file value (if present)
3. Fallback to `default_model` (for optional models)
4. Hardcoded default (for `default_model`: "claude-sonnet-4-6")

**Example Resolution for `reasoning_model`**:
```
CHLOE_REASONING_MODEL set? → use it
else config.toml has reasoning_model? → use it
else → use default_model value
```

## Breaking Changes

| Old Format | New Format | Migration |
|------------|------------|-----------|
| `model = "..."` | `default_model = "..."` | Manual rename |
| `CHLOE_MODEL` | `CHLOE_DEFAULT_MODEL` | Manual rename |

**Behavior**: Old fields are silently ignored (no errors, no auto-migration).

## Model ID Validation

**Supported Models**:
- `claude-opus-4-6`
- `claude-sonnet-4-6`
- `claude-haiku-4-5-20251001`

**Validation**: At config load time, check if model ID matches supported list. Invalid models logged as warning (not error) - allows future model support without code changes.