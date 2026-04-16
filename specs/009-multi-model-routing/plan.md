# Implementation Plan: Multi-Model Routing System

**Branch**: `009-multi-model-routing` | **Date**: 2026-04-16 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/009-multi-model-routing/spec.md`

## Summary

Implement multi-model routing system that automatically selects the appropriate model (default_model, reasoning_model, fast_model, vision_model) based on request characteristics. Routing decisions use prompt-based classification with route tokens (`[REASONING]`, `[FAST]`, `[VISION]`) at line start during streaming generation. Tool calls are executed by default_model with results returned to the calling model.

## Technical Context

**Language/Version**: TypeScript 5.x (strict mode)
**Primary Dependencies**: @anthropic-ai/sdk, Bun ≥ 1.1
**Storage**: bun:sqlite (via SQLiteStorageAdapter)
**Testing**: bun test
**Target Platform**: Linux server / CLI
**Project Type**: Monorepo CLI library with API server option
**Performance Goals**: Route detection within first 50 tokens, streaming latency minimal
**Constraints**: Maximum 5 route switches per request, config priority: env var > TOML > defaults
**Scale/Scope**: Single agent instance per session, multi-model coordination

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| Core-Library-First | ✅ PASS | ModelRouter, RoutingRunLoop, ToolExecutor will be in `@chloe/core` |
| Strict TypeScript | ✅ PASS | All new code uses strict mode, no `any` or casts |
| Biome for Static Analysis | ✅ PASS | Will pass `biome check --error-on-warnings` |
| DRY — Single Source of Truth | ✅ PASS | Routing logic centralized in RoutingRunLoop |
| Plugin Contracts Over Concrete Implementations | ✅ PASS | ModelRouter as interface, RoutingRunLoop as implementation |
| Streaming Always | ✅ PASS | Route token detection during streaming generation |
| Unit Tests for Important Logic | ✅ PASS | Routing decision, route token detection, fallback logic covered |
| Human-in-the-Loop by Default | ⚠️ REVIEW | Tool execution already requires confirmation; routing doesn't change this |

**Violations**: None. Constitution aligned.

**Breaking Change Note**: Env var `CHLOE_MODEL` → `CHLOE_DEFAULT_MODEL`. Constitution mentions `CHLOE_MODEL` default. Requires constitution update for env var naming.

## Project Structure

### Documentation (this feature)

```text
specs/009-multi-model-routing/
├── spec.md              # Feature specification
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
├── tasks.md             # Phase 2 output
├── routing-flows.md     # Flow diagrams
├── implementation-notes.md  # Design decisions
└── checklists/
    └── requirements.md  # Spec checklist
```

### Source Code (repository root)

```text
packages/core/src/
├── agent/
│   ├── agent.ts         # Existing Agent class (modified)
│   ├── loop.ts          # Existing RunLoop (modified → RoutingRunLoop)
│   ├── types.ts         # Existing types (modified)
│   ├── router.ts        # NEW: ModelRouter implementation
│   └── tool-executor.ts # NEW: ToolExecutor for default_model tool calls
│   └── route-detector.ts # NEW: Route token detection logic
│   └── config-resolver.ts # NEW: Model config resolution + fallback
├── config.ts            # Existing config (modified for new fields)
├── storage/             # Existing (unchanged)
├── tools/               # Existing (unchanged)
└── logger/              # Existing (unchanged)

packages/core/src/agent/
├── router.test.ts       # NEW: ModelRouter tests
├── route-detector.test.ts # NEW: Route token detection tests
├── config-resolver.test.ts # NEW: Config resolution tests
├── loop.test.ts         # Modified: RoutingRunLoop tests

packages/cli/src/
└── commands/            # Existing (unchanged for routing)

packages/api/src/
├── router.ts            # Existing API router (unchanged)
└── server.ts            # Existing server (unchanged)
```

**Structure Decision**: Follows existing monorepo structure. New routing modules added to `@chloe/core` in `agent/` subdirectory. Config changes in existing `config.ts`.

## Complexity Tracking

> **No violations requiring justification**

| Aspect | Approach | Rationale |
|--------|----------|-----------|
| Route token detection | Line start regex matching | Simpler than LLM-based, sufficient for prompt-based classification |
| Tool execution isolation | Independent default_model calls | Maintains consistency, simpler than per-model tool capabilities |
| Switch limit | Hard limit of 5 | Simple counter, prevents infinite loops without complex detection |
| Config field rename | Breaking change | Manual migration simpler than backward compatibility layer |