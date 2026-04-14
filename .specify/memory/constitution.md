# Chloe Constitution

## Core Principles

### I. Core-Library-First
Every feature is implemented in `@chloe/core` as a pure TypeScript library first. CLI and API are thin entry points that consume the core — no business logic lives in entry points. The core must be independently testable without starting a server or CLI.

### II. Strict TypeScript (Non-Negotiable)
All code uses `strict: true`, `exactOptionalPropertyTypes: true`, and `noUncheckedIndexedAccess: true`. No `any`, no `as` casts except at system boundaries (SDK types). TypeScript errors are build-blockers.

### III. Biome for Static Analysis (Non-Negotiable)
All code must pass `biome check --error-on-warnings` before commit. Formatting and linting are Biome's responsibility — no Prettier, no ESLint.

### IV. DRY — Single Source of Truth
Logic lives in exactly one place. The ReAct loop, session management, tool registry, and storage adapter are implemented once in `@chloe/core`. CLI and API share these implementations without copy-paste.

### V. Plugin Contracts Over Concrete Implementations
Storage, tools, and future capabilities are defined as TypeScript interfaces first. The SQLite storage and EchoTool are reference implementations, not the canonical ones. New implementations swap in without touching core logic.

### VI. Streaming Always
All Claude interactions use the Anthropic streaming API. Responses are forwarded to consumers (stdout, SSE) in real time. Buffered / non-streaming responses are not acceptable.

### VII. Unit Tests for Important Logic
The ReAct loop state machine, tool registry, storage adapter contract, and session ID validation are covered by unit tests. Coverage percentage is not enforced — coverage of *critical paths* is. Tests use `bun test`.

### VIII. Human-in-the-Loop by Default
Tool execution requires explicit user confirmation unless `--yes` is passed. This is a safety mechanism, not a convenience toggle.

## Technology Stack

- **Runtime**: Bun ≥ 1.1 (no Node.js shims)
- **Language**: TypeScript (strictest settings — see Principle II)
- **Static analysis**: Biome
- **AI provider**: Anthropic Claude (`claude-sonnet-4-6` default, overridable via `ANTHROPIC_MODEL`)
- **Storage**: `bun:sqlite` (default); pluggable via `StorageAdapter` interface
- **Test runner**: `bun test`
- **Package structure**: Bun workspace — `packages/core`, `packages/cli`, `packages/api`

## Development Workflow

1. Spec change → update `.specify/spec.md` first
2. Write failing tests for new behavior
3. Implement until tests pass
4. Run `biome check` — fix all issues
5. Run `bun test` — all tests must pass
6. No PR/commit with failing tests or Biome errors

## Governance

This constitution supersedes all other practices. Amendments require updating this document with a rationale comment. All implementation decisions must be verifiable against the spec and this constitution.

**Version**: 1.0.0 | **Ratified**: 2026-04-13 | **Last Amended**: 2026-04-13
