# Review Guide: Single-Model Routing Fix & Refactor Residue Cleanup

**Spec:** [spec.md](spec.md) | **Plan:** [plan.md](plan.md) | **Tasks:** [tasks.md](tasks.md)
**Generated:** 2026-04-17

---

## What This Spec Does

Chloe's model config has four slots: `default_model`, plus three specialized ones (`reasoning_model`, `fast_model`, `vision_model`). Spec 009 added subagent delegation tools (`vision_analyze`, `fast_query`, `deep_reasoning`) so the main agent could hand specialized work to different models. But 009 registered those tools unconditionally — so a user who only sets `default_model` still sees the tools in the prompt AND gets told to delegate, even though every delegation just calls back to the same model. This spec makes tool registration + the subagent system prompt conditional on the config actually being multi-model, and cleans up the residue the 009 refactor left behind (dead types, a duplicated ReAct loop, stale test comments).

**In scope:**
- Gate subagent tool registration on effective config distinctness.
- Gate the subagent system prompt on whether subagent tools were registered.
- Collapse `runLoop` + `routingRunLoop` into one function.
- Remove `ToolCallContext` and `RoutingState` dead types.
- Add `SUPERSEDED` banners to `specs/009-multi-model-routing/` documents describing the old route-token design.

**Out of scope:**
- Mid-session config reload (agent config is read at construction; changes take effect on next session start).
- Image-path handling behavior in single-model mode (if the default model doesn't support images, that's the user's config choice).
- Rewriting spec 009 documents in full — only banners are added.
- The subagent tools' internal recursion-prevention check is retained as defensive code, not removed.

## Bigger Picture

This spec is a follow-up to [009-multi-model-routing](../009-multi-model-routing/), which itself went through a mid-stream refactor (route tokens → subagent tools, see commit `f00cefb`). The audit that seeded this spec found that the refactor left behind dead code paths: a parallel `runLoop` used only by its own tests while production used `routingRunLoop`, unused fields like `RoutingState.callingTool` and `RoutingRunLoopOptions.hasImages`, and spec 009 documents describing the abandoned design. Spec 010 is the cleanup pass plus the single-model correctness fix that was missed during the 009 refactor.

The broader trajectory: Chloe's `Agent` class is the single point where CLI and HTTP API entrypoints converge (both call `createAgent`), so behavior gating here flows to every consumer without per-entrypoint work. A notable side effect of this spec is that `Agent`'s observable behavior now branches on the resolved config — a constructor-time decision that will be hard to change later without breaking session semantics. Reviewers should consider whether "one-shot decision at construction" is the right durability for this gating.

---

## Spec Review Guide (30 minutes)

> This guide helps you focus your 30 minutes on the parts of the spec and plan
> that need human judgment most. Each section points to specific locations and
> frames the review as questions.

### Understanding the approach (8 min)

Read [spec.md §User Story 1](spec.md#user-story-1---single-model-configuration-behaves-as-single-model-priority-p1) and the [Edge Cases](spec.md#edge-cases). As you read, consider:

- The spec defines "single-model" as *effective* distinctness, not user intent ([Assumptions §1](spec.md#assumptions)). Is that the right semantics? A user who explicitly wrote `fast_model = default_model` in their TOML might expect delegation to still happen — is silently skipping it the better default?
- [FR-003](spec.md#functional-requirements) gates the prompt on tool availability, not on `multiModel`. This matters for [US3 caller-supplied tools](spec.md#user-story-3---callers-that-inject-custom-tools-control-their-own-prompt-surface-priority-p2): the prompt is absent even in multi-model config when `tools: []` is passed. Is "tool availability" the right trigger rather than "mode"?
- The [partial multi-model edge case](spec.md#edge-cases) (only `fast_model` differs) registers all three subagent tools. Is that the right call, or should registration be per-tool based on which specialized model differs?

### Key decisions that need your eyes (12 min)

**Detection via resolved config comparison** ([research.md §Decision 1](research.md#decision-1-how-to-detect-single-model-vs-multi-model-mode))

Decision: derive `multiModel` boolean in the `Agent` constructor by comparing three resolved strings to `defaultModel`. Alternative considered: a separate `multi_model.enabled` TOML toggle.
- Question for reviewer: the spec explicitly rejects the explicit toggle because "the user prefers effective config to drive behavior." Is this the right user-facing mental model, or would an explicit toggle make the behavior easier to reason about? This decision is load-bearing for US1's acceptance — if you disagree, much of the spec restructures.

**Collapsing the two loops into one** ([research.md §Decision 2](research.md#decision-2-one-loop-vs-two-loops))

Decision: merge `runLoop` and `routingRunLoop` into a single `runLoop` with optional `system?: string`. Alternative: keep both with one delegating to the other.
- Question for reviewer: the merge means the loop takes a new code path (optional-field spread into `messages.stream` params). [contracts/agent-api.md §2](contracts/agent-api.md#2-runloop--packagescoresrcagentloopts) specifies `...(system !== undefined ? { system } : {})`. Is this spread pattern acceptable in the codebase, or do you prefer an explicit union at the call site?

**Where the subagent system prompt lives** ([research.md §Decision 3](research.md#decision-3-where-the-system-prompt-decision-lives))

Decision: `SUBAGENT_SYSTEM_PROMPT` moves from `loop.ts` to `agent.ts`; the loop stays subagent-agnostic. Alternative: loop inspects the registry for subagent-named tools.
- Question for reviewer: moving the constant correctly assigns responsibility (policy in `Agent`, mechanism in loop), but it also means if someone later adds a different specialized prompt mode, they add *another* prompt field to `RunLoopOptions`. Is that the right growth path, or should there be a `prompts: { system?: string; ... }` bag from the start?

**Spec 009 drift handling** ([research.md §Decision 5](research.md#decision-5-treatment-of-specs009-multi-model-routing-drift))

Decision: add a SUPERSEDED banner to each 009 doc rather than rewriting or deleting. Alternative: rewrite in place, or single SUPERSEDED.md pointer.
- Question for reviewer: is banner-only sufficient, or does `specs/009-multi-model-routing/REVIEWERS.md` (if present) need special handling since reviewers specifically land there?

### Areas where I'm less certain (5 min)

- [spec.md FR-007](spec.md#functional-requirements): "The production ReAct loop invocation path MUST have direct unit test coverage." This is satisfied by collapsing the two loops so existing `loop.test.ts` tests become production coverage. But the tests currently assert internal behavior (tool confirmation, recursion prevention) via mocked `client.messages.stream` — none of them exercise the conditional `system` injection. I added a new test for that in [tasks.md T008](tasks.md) / [T013](tasks.md). Is that extraction of `system`-injection testing at the agent level enough, or should it also live in `loop.test.ts`?

- [spec.md Assumption §3](spec.md#assumptions): subagent tools' recursion check is retained despite being unreachable. [tasks.md T021](tasks.md) adds an inline comment explaining why. This is a judgment call — comments age poorly. Would you prefer the check be removed now with a note in the spec, trusting future developers not to re-introduce recursion by accident?

- [plan.md Performance Goals](plan.md#technical-context): no concrete performance target is set. The refactor could plausibly affect streaming latency if the `messages.stream` params shape changes how the SDK batches. [SC-007](spec.md#success-criteria) relies on "no test-count regression" as the proxy. Is that an acceptable NFR proxy, or should we measure streaming latency explicitly before/after?

### Risks and open questions (5 min)

- If a user sets `fast_model = default_model` *intentionally* and expects delegation to happen (because they want to test the subagent prompt with one model), will this spec's behavior surprise them? Should [spec.md Edge Cases](spec.md#edge-cases) §2 handle this with a debug-log note at least?
- The `multiModel` flag is immutable for the agent's lifetime ([data-model.md §State transitions](data-model.md#state-transitions)). If a user edits config mid-session, nothing happens until next session. Is that discoverable enough? Should the CLI log which mode it started in?
- [contracts/agent-api.md §7](contracts/agent-api.md#7-test-contract): a new `agent.test.ts` file is introduced and it uses mocked `Anthropic` clients to inspect `messages.stream` params. Is that mocking pattern already established in the codebase, or is this spec introducing a new test convention?
- [tasks.md T022](tasks.md) adds banners to *every* 009 document describing the route-token design. [spec.md FR-012](spec.md#functional-requirements) says the choice of "update in place" vs. "mark superseded" is author-discretion. If you'd prefer some docs rewritten (e.g., `spec.md`'s FR-009 if it now matches current behavior), flag specific files.

---
*Full context in linked [spec](spec.md) and [plan](plan.md).*
