# Phase 1 Data Model: Single-Model Routing Fix

**Feature**: 010-single-model-routing-fix
**Date**: 2026-04-17

This feature introduces one derived boolean value and trims three existing types. No persisted data model changes. No database schema changes.

---

## Derived value

### `multiModel: boolean`

**Source of truth**: `Agent` constructor, derived once from the resolved `ResolvedModelConfig`.

**Derivation rule**:

```text
multiModel =
  resolved.reasoningModel !== resolved.defaultModel
  OR resolved.fastModel !== resolved.defaultModel
  OR resolved.visionModel !== resolved.defaultModel
```

**Semantics**:
- `true` → agent is in multi-model mode; subagent tools are registered; subagent system prompt is included in model requests.
- `false` → agent is in single-model mode; subagent tools are not registered; subagent system prompt is not included.

**Exposed through**: None. Held as a private field on `Agent`. Callers cannot query it directly; they observe its effect via the tool registry contents and API request contents.

**Lifetime**: Agent construction → agent disposal. Not recomputed per request.

**Helper**: `isMultiModel(cfg: ResolvedModelConfig): boolean` added to `packages/core/src/agent/router.ts` for testability and for reuse if another caller ever needs the same determination.

---

## Existing types modified

### `ResolvedModelConfig` (no change)

Already defined in `packages/core/src/agent/types.ts:38-43`. Continues to hold `defaultModel`, `reasoningModel`, `fastModel`, `visionModel`. Unchanged by this feature — it remains the sole input to the single-vs-multi-model decision.

### `RunLoopOptions` (add `system`, remove dead fields from legacy `RoutingRunLoopOptions`)

Current state:
- `RunLoopOptions`: `messages`, `client`, `model`, `tools`, `callbacks`.
- `RoutingRunLoopOptions extends RunLoopOptions`: adds `modelConfig` (unused by loop), `hasImages?` (unused by loop).

Post-feature state (single merged `RunLoopOptions`):
- `messages: MessageParam[]`
- `client: Anthropic`
- `model: string`
- `tools: ToolRegistry`
- `callbacks: AgentCallbacks`
- `system?: string` — optional system prompt string; when present, passed to `client.messages.stream({ system, ... })`; when absent, omitted from the stream params.

`RoutingRunLoopOptions` is removed.

### `RoutingState` (remove)

Currently declared in `types.ts:20-23` with `currentModel` (duplicate of `model` option) and `callingTool` (never read). Removed in full.

### `ToolCallContext` (remove)

Declared in `types.ts:28-33`. Unused. Removed in full.

### `AgentConfig` (no change)

Already declared in `types.ts:47-55`. Continues to accept `modelConfig?: ResolvedModelConfig` for callers wanting to inject a specific multi-model config. Unchanged by this feature.

### `AgentCallbacks` (no change)

Callback surface unchanged.

---

## Tools (no shape change)

`vision_analyze`, `fast_query`, `deep_reasoning`: unchanged tool definitions. Only their registration gating changes (at the `Agent` constructor level).

The `Tool` interface in `packages/core/src/tools/types.ts` is unchanged.

---

## State transitions

No new state machines introduced. The `multiModel` flag is immutable for the lifetime of the `Agent` instance. Transitions happen only by destroying the agent and constructing a new one (e.g., at the next CLI `chat` invocation).

---

## Validation rules

None. The derivation from `ResolvedModelConfig` cannot fail — `resolveModelConfig` guarantees all four string fields are populated (non-empty) via fallback chain.

Edge case: if a user somehow sets `reasoning_model = ""` (empty string), TOML parsing treats it as unset and fallback applies, producing `reasoningModel === defaultModel` in the resolved config → correctly classified as single-model. No extra validation is needed.
