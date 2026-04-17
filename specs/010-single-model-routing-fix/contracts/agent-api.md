# Contract: Internal Agent + Loop API Changes

**Feature**: 010-single-model-routing-fix
**Date**: 2026-04-17
**Scope**: Internal APIs inside `@chloe/core`. No changes to the public export surface of `@chloe/core`.

---

## 1. `Agent` class — `packages/core/src/agent/agent.ts`

### Constructor behavior (observable change)

```text
new Agent(config: AgentConfig)
```

**Before**: when `config.tools === undefined`, always registers `createDefaultTools(...)` plus `createSubagentTools(...)`.

**After**: when `config.tools === undefined`:
1. Register `createDefaultTools(...)` unconditionally.
2. Compute `multiModel = isMultiModel(resolvedModelConfig)`.
3. If and only if `multiModel === true`, register `createSubagentTools(...)`.
4. Store `multiModel` and the appropriate system prompt on the `Agent` instance.

**When `config.tools !== undefined`** (caller-supplied tools):
1. Register only the caller's tools.
2. `multiModel` is treated as `false` for prompt purposes; no system prompt is attached.

### `run(sessionId, userMessage, callbacks)` behavior (observable change)

The call to the loop (internal) now passes a `system` option iff subagent tools were auto-registered:

```text
await runLoop({
  messages,
  client: this.client,
  model: initialModel,
  tools: this.registry,
  callbacks,
  ...(this.subagentPromptActive ? { system: SUBAGENT_SYSTEM_PROMPT } : {}),
});
```

No change to return shape: still `RunResult`.

### `AgentConfig` input shape

Unchanged. `modelConfig?: ResolvedModelConfig` remains optional. `tools?: Tool[]` remains optional. No new required fields.

---

## 2. `runLoop` — `packages/core/src/agent/loop.ts`

### New merged options type

```text
interface RunLoopOptions {
  messages: MessageParam[];
  client: Anthropic;
  model: string;
  tools: ToolRegistry;
  callbacks: AgentCallbacks;
  system?: string;       // NEW — passed through to messages.stream when present
}
```

`RoutingRunLoopOptions` is removed.

### Loop body contract

Single implementation named `runLoop`. Behavior:

1. On each iteration, call `client.messages.stream({ model, tools: tools.list(), messages, max_tokens: 4096, ...(system !== undefined ? { system } : {}) })`.
2. All other behavior (tool confirmation, tool execution, recursion-prevention via `tools.setCallingTool`, end_turn handling, error → tool_result injection) is unchanged from the current `routingRunLoop`.
3. No knowledge of `modelConfig` or `hasImages` — those were dead parameters and are removed from the options type.

### Exports

`runLoop` remains the only loop export. `routingRunLoop` is removed. `RoutingRunLoopOptions` is removed.

---

## 3. `packages/core/src/agent/router.ts`

### New exported helper

```text
isMultiModel(config: ResolvedModelConfig): boolean
```

Returns `true` iff any of `reasoningModel`, `fastModel`, `visionModel` differs from `defaultModel`.

### Existing helpers

`resolveModelConfig`, `selectInitialModel`, `DEFAULT_MODEL`, `SUPPORTED_IMAGE_EXTENSIONS` — unchanged.

---

## 4. `packages/core/src/agent/types.ts`

### Removed types

- `RoutingState` — removed.
- `ToolCallContext` — removed.

### Unchanged types

- `ImageInput`
- `ResolvedModelConfig`
- `AgentConfig`
- `TurnUsage`
- `AgentCallbacks`
- `RunResult`

---

## 5. Public export surface (`packages/core/src/index.ts`)

No change. Still exports `Agent`, `createAgent`, `resolveModelConfig`, and the types consumed by CLI/API (`AgentCallbacks`, `AgentConfig`, `ResolvedModelConfig`, `RunResult`, `TurnUsage`).

---

## 6. Subagent tools (`packages/core/src/tools/subagent.ts`)

No interface change. Tools continue to implement the `Tool` interface. Only the registration gating (inside `Agent` constructor) changes.

---

## 7. Test contract

### New test expectations

- `agent.test.ts` (new file, or inside `agent/` directory): constructing an `Agent` with a single-model `ResolvedModelConfig` yields a `ToolRegistry` whose `list()` contains no entries named `vision_analyze` / `fast_query` / `deep_reasoning`. Constructing with a multi-model config registers all three.
- `agent.test.ts`: when a caller provides `tools: [customTool]`, the registry contains only `customTool` regardless of model config.
- `loop.test.ts`: existing 6 tests continue to pass against the merged `runLoop`. New test case: when `system` is provided, the mocked `client.messages.stream` call receives it in its params; when absent, the params do not include a `system` field.

### Removed / updated test expectations

- `loop.test.ts` comments referencing "route tokens" are rewritten to describe current behavior.
- No test count reduction: any scenarios unique to the old `routingRunLoop` (there are none beyond `system` injection) are folded in.

---

## Breaking-change assessment

- **External package consumers**: none. `@chloe/core` never exported the loop functions, `RoutingState`, `ToolCallContext`, or `RoutingRunLoopOptions`.
- **Internal callers**: `agent.ts` is the only internal caller of `routingRunLoop`; it is updated in lockstep.
- **Tests**: `loop.test.ts` imports `runLoop`, which remains exported under the same name.
