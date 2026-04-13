# Quickstart: Chloe — Personal AI Agent

**Branch**: `001-chloe-personal-ai-agent`

## Prerequisites

- Bun ≥ 1.1 (`curl -fsSL https://bun.sh/install | bash`)
- Anthropic API key

## Setup

```bash
# Clone and install
git clone ... && cd chloe
bun install

# Set your API key
export ANTHROPIC_API_KEY=sk-ant-...

# Build all packages
bun run build
```

## Usage

### Start a conversation (CLI)

```bash
# New or existing session
bun run --filter @chloe/cli start chat --session my-project

# Short: after linking the binary
chloe chat --session my-project
```

### Start the API server

```bash
chloe serve --port 3000
# or
bun run --filter @chloe/api start
```

### Manage sessions

```bash
chloe sessions list
chloe sessions delete my-project
```

## Development

```bash
# Run all tests
bun test

# Lint + format check
bunx biome check .

# Auto-fix formatting
bunx biome check --write .

# Type check
bun run typecheck
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ANTHROPIC_API_KEY` | Yes | — | Anthropic API key |
| `ANTHROPIC_MODEL` | No | `claude-sonnet-4-6` | Claude model to use |
| `CHLOE_DB_PATH` | No | `~/.chloe/chloe.db` | SQLite database path |
| `PORT` | No | `3000` | API server port |
