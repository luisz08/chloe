# Chloe — Personal AI Agent

A personal AI assistant built with Bun and TypeScript. Features a ReAct loop with human-in-the-loop tool confirmation, named sessions with SQLite persistence, a CLI for interactive chat, and an HTTP/SSE API for programmatic access.

## Prerequisites

- [Bun](https://bun.sh) ≥ 1.1
- An [Anthropic API key](https://console.anthropic.com/)

## Configuration

Config is stored at `~/.chloe/settings/config.toml` (created by `chloe config init`). Environment variables take precedence over the file.

| Variable | Config key | Default | Description |
|---|---|---|---|
| `CHLOE_API_KEY` | `provider.api_key` | — | Anthropic API key (required) |
| `CHLOE_MODEL` | `provider.model` | `claude-sonnet-4-6` | Model to use |
| `CHLOE_PROVIDER` | `provider.name` | `anthropic` | Provider name |
| `CHLOE_BASE_URL` | `provider.base_url` | — | Custom API base URL |
| `CHLOE_DB_PATH` | `storage.db_path` | `~/.chloe/sessions/chloe.db` | SQLite database path |
| `CHLOE_LOG_DIR` | `logging.log_dir` | `./logs` | Log output directory |
| `CHLOE_LOG_LEVEL` | `logging.level` | `info` | Log level (`debug`, `info`, `warn`, `error`) |
| `PORT` | — | `3000` | API server port (overridden by `--port`) |

## Development

```bash
# Install dependencies
bun install

# Run tests
bun test

# Lint and format check
bun run check

# Type check
bun run typecheck
```

## Usage

### CLI

The CLI is in `packages/cli`. Run it directly with Bun:

```bash
bun run packages/cli/src/index.ts <subcommand>
```

Or install globally:

```bash
bun link packages/cli
```

#### Config

Set up the config file interactively:

```bash
chloe config init
```

View the current effective configuration (with source annotations):

```bash
chloe config show
```

Get or set individual keys:

```bash
chloe config get provider.model
chloe config set provider.model claude-opus-4-6
```

Valid keys: `provider.api_key`, `provider.name`, `provider.model`, `provider.base_url`, `storage.db_path`.

#### Chat

Start or resume a named session:

```bash
CHLOE_API_KEY=sk-ant-... chloe chat --session my-session
```

The session name is converted to a URL-safe slug and stored persistently. Re-running with the same `--session` name restores prior conversation history.

By default, any tool call requires explicit confirmation (`y/n`). Pass `--yes` to auto-approve all tool calls:

```bash
chloe chat --session my-session --yes
```

Type `exit` or press `Ctrl-C` to quit.

#### Session management

```bash
# List all sessions
chloe sessions list

# Delete a session and its history
chloe sessions delete <session-id>
```

#### API server

Start the HTTP/SSE API server:

```bash
CHLOE_API_KEY=sk-ant-... chloe serve
CHLOE_API_KEY=sk-ant-... chloe serve --port 8080
```

### API

#### `POST /sessions/:id/messages`

Send a message to a session. Creates the session if it does not exist. Streams the response as server-sent events.

```bash
curl -N -X POST http://localhost:3000/sessions/my-session/messages \
  -H "Content-Type: application/json" \
  -d '{"content": "Hello!"}'
```

Response stream (`text/event-stream`):

```
data: {"type":"token","text":"Hi"}
data: {"type":"token","text":" there"}
data: [DONE]
```

#### `GET /sessions`

List all sessions.

```bash
curl http://localhost:3000/sessions
```

#### `DELETE /sessions/:id`

Delete a session and all its history.

```bash
curl -X DELETE http://localhost:3000/sessions/my-session
```

## Project Structure

```
packages/
  core/    — Agent logic, session management, storage, tool registry
  api/     — Bun HTTP server with SSE streaming
  cli/     — Interactive terminal interface
specs/     — Feature specifications
```

## Adding Tools

Implement the `Tool` interface from `@chloe/core` and pass instances at agent construction time:

```ts
import type { Tool } from "@chloe/core";

const MyTool: Tool = {
  name: "my_tool",
  description: "Does something useful",
  inputSchema: { /* JSON Schema */ },
  execute: async (input) => "result",
};

const agent = createAgent({ tools: [MyTool], ... });
```
