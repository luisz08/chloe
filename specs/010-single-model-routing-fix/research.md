# Phase 0 Research: Single-Model Routing Fix

**Feature**: 010-single-model-routing-fix
**Date**: 2026-04-17

No `NEEDS CLARIFICATION` markers in the Technical Context. This document captures the design decisions that shape Phase 1.

---

## Decision 1: How to detect single-model vs. multi-model mode

**Decision**: Derive a boolean `multiModel` in `Agent`'s constructor by comparing the three specialized models against `defaultModel` on the `ResolvedModelConfig`. `multiModel` is true iff at least one of `reasoningModel`, `fastModel`, `visionModel` has a value that differs from `defaultModel`.

**Rationale**:
- Matches the spec's "effective distinctness" requirement (FR-001, Edge Cases, Assumptions). A user who explicitly sets `fast_model = default_model` gets the same treatment as one who leaves it unset.
- `ResolvedModelConfig` already applies the fallback `?? defaultModel` in `router.ts#resolveModelConfig`, so comparing three strings after resolution is a reliable single source of truth. No duplicate knowledge of defaults elsewhere.
- Placing the derivation in the constructor (not per-request) matches the spec's assumption that config is read once at agent construction and mid-session changes are out of scope.

**Alternatives considered**:
- *Detecting at config-load time inside `loadConfig`*. Rejected: the `ChloeConfig` → `ResolvedModelConfig` → `Agent` pipeline lets two entry points (CLI and API) build a `ResolvedModelConfig` differently. Keeping detection in `Agent` handles both uniformly. Also, callers that construct `Agent` directly (tests, embedders) benefit from the guard without having to call `loadConfig`.
- *Exposing a `multi_model.enabled` config toggle*. Rejected in Phase 0 brainstorming: the user explicitly prefers the behavior to be driven by effective config rather than a separate flag. Reduces cognitive surface by one config knob.
- *Per-request detection*. Rejected: no benefit for the current spec (no mid-session config change support), and needlessly recomputes identical result every turn.

**Contract impact**: Adds a new publicly-observable behavior of `Agent` (subagent tools conditionally absent) but the `AgentConfig` input shape is unchanged. No breaking API change.

---

## Decision 2: One loop vs. two loops

**Decision**: Collapse `runLoop` and `routingRunLoop` into a single `runLoop` function. Accept an optional `system` parameter on `RunLoopOptions`; when set, pass it through to `client.messages.stream({ system, ... })`. Remove the `RoutingRunLoopOptions` type and the `routingRunLoop` export.

**Rationale**:
- The current `routingRunLoop` differs from `runLoop` by exactly two things: (a) it passes `system: SUBAGENT_SYSTEM_PROMPT`, and (b) it maintains a `RoutingState` whose `callingTool` field is dead and whose `currentModel` field is equivalent to the existing `model` parameter on the options type. Once both residual fields are removed (per FR-008), there is no behavioral daylight between the two functions beyond the `system` string.
- DRY (Constitution IV): ~130 lines of duplicated loop body become one.
- Tests currently target `runLoop` (the legacy one). Collapsing means existing `loop.test.ts` coverage becomes meaningful production coverage (FR-007, SC-003).
- Aligns with the constitution's "ReAct loop implemented once in `@chloe/core`" principle.

**Alternatives considered**:
- *Keep both, make `runLoop` delegate to `routingRunLoop` with `system: undefined`*. Rejected: two public functions for the same behavior is exactly the residue the cleanup aims to remove.
- *Keep both, delete `runLoop` and port legacy tests to `routingRunLoop`*. Rejected: equivalent outcome but leaves a function name (`routingRunLoop`) that carries misleading history. A plain `runLoop` that happens to accept an optional system prompt is the honest name for what exists post-refactor.

**Contract impact**: External surface: `@chloe/core/index.ts` does not currently export any loop function (only `Agent`), so this is internal. Tests switch from `runLoop` → unchanged (name preserved). Callers inside `agent.ts` switch from `routingRunLoop` → `runLoop` with a `system` argument.

---

## Decision 3: Where the `system` prompt decision lives

**Decision**: The caller (`Agent`) owns the decision of which `system` prompt to pass. `Agent` holds `SUBAGENT_SYSTEM_PROMPT` and passes it only when `multiModel === true` AND it auto-registered subagent tools. The loop is subagent-agnostic.

**Rationale**:
- Single responsibility: loop handles ReAct mechanics; agent handles multi-model routing policy.
- Avoids coupling the loop to the subagent prompt string (currently a module-level constant inside `loop.ts`, which is the wrong owner).
- Makes the caller-supplied-tools case (US3) trivial: when caller provides `config.tools`, `Agent` never sets the subagent system prompt. No extra branches inside the loop.

**Alternatives considered**:
- *Have the loop inspect `tools.list()` for subagent tool names and auto-inject the prompt*. Rejected: couples the loop to specific tool names, violates Tool/Loop separation, breaks if tool names change.
- *Store the system prompt on the `ToolRegistry` itself*. Rejected: registry shouldn't know about system prompts; it's a Tool container.

**Contract impact**: `SUBAGENT_SYSTEM_PROMPT` moves from `loop.ts` to `agent.ts` (or a sibling module). Internal only.

---

## Decision 4: `RoutingState` disposition

**Decision**: Remove `RoutingState` entirely. Its `currentModel` is equivalent to the `model` parameter already on `RunLoopOptions`, and its `callingTool` field is never read (real recursion prevention lives on `ToolRegistry`).

**Rationale**: Dead struct. Removing reduces type surface and eliminates the temptation to "fix" the apparent duplication by wiring `callingTool` to the registry (which would create a second source of truth).

**Alternatives considered**:
- *Keep `RoutingState` but drop the dead `callingTool` field*. Rejected as half-measure: the remaining single `currentModel` field is still duplicative of the `model` option.

**Contract impact**: Internal only; `RoutingState` is not re-exported from `packages/core/src/index.ts`.

---

## Decision 5: Treatment of `specs/009-multi-model-routing/` drift

**Decision**: Add a prominent `> **SUPERSEDED**: This document describes the route-token design, which was replaced by subagent tools in spec 010.` banner at the top of every document under `specs/009-multi-model-routing/` that still describes route tokens (all of them except possibly `spec.md`'s updated FR-009 section). Do NOT rewrite the bodies.

**Rationale**:
- SC-009 requires a reader to determine design status within 30 seconds; a top banner is the cheapest and most reliable signal.
- Rewriting all 10 documents to match current code is a separate, larger piece of work outside this feature's scope (Assumption in spec).
- The banner also preserves history: readers researching "why the original design was chosen" still have access to `research.md`'s decision matrix for the route-token approach.

**Alternatives considered**:
- *Delete the stale documents*. Rejected: destroys design history for future refactors.
- *Rewrite every document in place*. Rejected: out of scope; would double the size of this feature.
- *Single "SUPERSEDED.md" pointer in the folder*. Rejected: readers land on individual documents (e.g., linked from `REVIEWERS.md`), so a per-document banner is what catches them.

**Contract impact**: None; documentation only.

---

## Decision 6: Recursion-prevention check in subagent tools

**Decision**: Retain the `registry.getCallingTool()` check at the top of each subagent tool as defensive code. Add a short comment explaining it cannot fire in the current design (inner `client.messages.create` calls pass no tools) but that it prevents accidental recursion if a future change passes the registry deeper.

**Rationale**: Explicitly captured in the spec's Assumptions section. Cheap to keep; removing is not required by any FR.

**Alternatives considered**:
- *Remove the check entirely*. Rejected per spec Assumption.

**Contract impact**: None.

---

## Summary of artifacts this planning phase produces

- `plan.md` (this feature plan)
- `research.md` (this document)
- `data-model.md` (Phase 1)
- `contracts/agent-api.md` (Phase 1)
- `quickstart.md` (Phase 1)
