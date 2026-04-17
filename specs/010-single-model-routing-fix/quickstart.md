# Quickstart: Verify Single-Model Routing Fix

**Feature**: 010-single-model-routing-fix
**Audience**: Developer verifying the implementation locally.

This guide walks through hands-on verification of the spec's success criteria after the implementation lands. It assumes the feature branch is checked out and dependencies are installed (`bun install`).

---

## 1. Run the full quality gate

```bash
bun test
bunx tsc --noEmit -p tsconfig.check.json
bunx biome check --error-on-warnings .
```

Expected: all three succeed. Corresponds to SC-007 and SC-008.

---

## 2. Verify no dead identifiers remain in `packages/`

```bash
rg -n 'ToolCallContext|detectRouteToken|checkLineStart|RouteTokenType|ROUTE_TOKENS|MAX_ROUTE_SWITCHES|routingRunLoop|RoutingState|RoutingRunLoopOptions' packages/
```

Expected: zero matches. Corresponds to SC-004.

---

## 3. Verify no "route token" residue in loop tests

```bash
rg -in 'route token' packages/core/src/agent/loop.test.ts
```

Expected: zero matches. Corresponds to SC-006.

---

## 4. Verify single-model agent has no subagent tools

Quick inline check via a one-off script (no config changes needed):

```ts
// scratch-single-model.ts
import { Agent, resolveModelConfig, SQLiteStorageAdapter } from "@chloe/core";

const storage = new SQLiteStorageAdapter(":memory:");
const modelConfig = resolveModelConfig({ defaultModel: "claude-sonnet-4-6" });
const agent = new Agent({
  model: "claude-sonnet-4-6",
  apiKey: "sk-dummy",
  storage,
  modelConfig,
});

// Inspect registry via an internal hook or a test-only accessor.
// Expected: tool list excludes vision_analyze, fast_query, deep_reasoning.
```

Equivalent assertion is encoded in the new agent-level unit test (FR-013).

---

## 5. Verify multi-model agent retains subagent tools

```ts
// scratch-multi-model.ts
import { Agent, resolveModelConfig, SQLiteStorageAdapter } from "@chloe/core";

const storage = new SQLiteStorageAdapter(":memory:");
const modelConfig = resolveModelConfig({
  defaultModel: "claude-sonnet-4-6",
  fastModel: "claude-haiku-4-5-20251001",
});
const agent = new Agent({
  model: "claude-sonnet-4-6",
  apiKey: "sk-dummy",
  storage,
  modelConfig,
});

// Expected: tool list includes vision_analyze, fast_query, deep_reasoning.
```

Equivalent assertion is encoded in the new agent-level unit test (FR-014).

---

## 6. Verify the subagent system prompt is conditional

Check that `packages/core/src/agent/agent.ts` passes the `system` option to the loop only when subagent tools were registered. A grep sanity check:

```bash
rg -n 'SUBAGENT_SYSTEM_PROMPT' packages/core/src/agent/
```

Expected: references only in `agent.ts` (both the constant and the conditional pass-through), none in `loop.ts`. Corresponds to the Decision 3 design choice in `research.md`.

---

## 7. Verify the spec 009 superseded banner

```bash
rg -n 'SUPERSEDED' specs/009-multi-model-routing/
```

Expected: banner present at the top of every document describing the route-token design. Corresponds to SC-009.

---

## 8. Smoke-test the CLI end-to-end (optional, requires real API key)

```bash
CHLOE_API_KEY=... chloe chat
# Send a message. Observe:
# - No references to vision_analyze / fast_query / deep_reasoning in any tool call log.
# - Response comes from default_model only.
```

Expected: no subagent tool invocations appear in the agent's structured log. Corresponds to SC-001.

Then, set a distinct fast model and repeat:

```bash
CHLOE_API_KEY=... CHLOE_FAST_MODEL=claude-haiku-4-5-20251001 chloe chat
# Send a simple lookup question. The model may choose to invoke fast_query;
# observe that the inner call targets the configured haiku model.
```

Expected: subagent tool invocations routed to the configured specialized model. Corresponds to SC-002.

---

## What NOT to verify in this quickstart

- Image-path handling in single-model mode — out of scope; image behavior depends on the default model's capabilities, which is the user's config choice.
- Mid-session config reload — explicitly out of scope per spec Assumptions.
