# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
bun test                                    # run all tests
bun test <path/to/file.test.ts>             # run a single test file
bunx biome check --error-on-warnings .      # lint + format check
bunx tsc --noEmit -p tsconfig.check.json    # type check
bun run --filter '*' build                  # build all packages
```

## Architecture

Monorepo with three packages under `packages/`:

- **`packages/core`** — shared library. All business logic lives here:
  - `agent/` — `Agent` class and `runLoop` (ReAct loop against the Anthropic API)
  - `config.ts` — TOML config at `~/.chloe/settings/config.toml`, overridable via `CHLOE_*` env vars
  - `logger/` — structured logger with file sink
  - `storage/` — `StorageAdapter` interface + `SQLiteStorageAdapter` (via `bun:sqlite`)
  - `session/` — session/message types and slug utilities
  - `tools/` — `ToolRegistry`, `Tool` interface, and built-in tools: `bash`, `read_file`, `write_file`

- **`packages/cli`** — CLI entrypoint (`chloe`). Subcommands: `chat`, `config`, `sessions`, `serve`

- **`packages/api`** — HTTP API server (Bun.serve). Imports from `@chloe/core` to set up agent + storage, then serves REST routes defined in `router.ts`.

## Key design points

- `Agent` loads config, creates an Anthropic client, and owns a `ToolRegistry`. Calling `agent.run(sessionId, message)` appends the user message to stored history, runs the ReAct loop, then persists new turns.
- Tools implement the `Tool` interface from `packages/core/src/tools/types.ts` and are registered via `ToolRegistry`.
- Storage is abstracted behind `StorageAdapter`; `SQLiteStorageAdapter` is the only implementation.
- Config priority: env vars > TOML file > defaults.

## Stack

TypeScript 5.x · Bun ≥ 1.1 · `@anthropic-ai/sdk` · `bun:sqlite` · Biome

<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->
