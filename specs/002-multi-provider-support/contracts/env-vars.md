# Contract: Environment Variables

**Feature**: Multi-Provider Support | **Version**: 1.0.0

## Required Variables

### `CHLOE_API_KEY`
- **Type**: String
- **Required**: Yes
- **Description**: Authentication credential for the AI provider (Anthropic or compatible)
- **Validation**: Must be non-empty; checked at startup
- **Error**: If missing → exit with message: `Error: CHLOE_API_KEY is not set`

## Optional Variables

### `CHLOE_MODEL`
- **Type**: String
- **Required**: No
- **Default**: `claude-sonnet-4-6`
- **Description**: Model identifier to use. Any model ID supported by the provider.
- **Examples**: `claude-sonnet-4-6`, `anthropic/claude-3-5-sonnet`, `openai/gpt-4o`

### `CHLOE_BASE_URL`
- **Type**: String (URL)
- **Required**: No
- **Default**: Anthropic SDK default (`https://api.anthropic.com`)
- **Description**: Base URL for an Anthropic-protocol-compatible provider
- **Examples**: `https://openrouter.ai/api/v1`

## Deprecated Variables (no longer read)

| Variable | Replaced By |
|----------|-------------|
| `ANTHROPIC_API_KEY` | `CHLOE_API_KEY` |
| `ANTHROPIC_MODEL` | `CHLOE_MODEL` |

## Unchanged Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `CHLOE_DB_PATH` | `~/.chloe/chloe.db` | SQLite database path |
| `PORT` | `3000` | API server port (api package only) |
