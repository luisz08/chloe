# Review Guide: Multi-Model Routing System

> **SUPERSEDED BY spec 010**: This document describes the route-token design, which was replaced by subagent tools. See `specs/010-single-model-routing-fix/` for the current design.

**Spec:** [spec.md](spec.md) | **Plan:** [plan.md](plan.md) | **Tasks:** [tasks.md](tasks.md)
**Generated:** 2026-04-16

---

## What This Spec Does

Multi-model routing automatically selects the best AI model for each request based on what the request needs. A quick "capital of France?" question goes to a fast model; a complex architectural analysis goes to a reasoning model; image inputs go to a vision model. The routing decision happens during streaming generation via prompt-based classification—the model outputs a routing token like `[REASONING]` or `[FAST]` at line start, and the system switches mid-stream to the appropriate model.

**In scope:**
- Route token detection at line start during streaming (`[REASONING]`, `[FAST]`, `[VISION]`)
- Image input pre-routing (paths and URLs detected before request)
- Model switching with abort-restart pattern (discard content, restart with target model)
- Tool execution coordination (results return to calling model)
- Configuration with 4 model fields and fallback logic
- Maximum 5 route switches per request (safety limit)

**Out of scope:**
- Video processing (images only for now)
- Auto-migration from old config fields (breaking change, manual update)
- LLM-based complexity detection (prompt-based classification only)
- Per-model tool capabilities (all tools execute via direct function call)

---

## Bigger Picture

This feature transforms Chloe from a single-model agent to a multi-model coordination system. The current architecture uses one model (`claude-sonnet-4-6`) for all requests. After this change, the agent can leverage the full Anthropic model family—Opus for deep reasoning, Haiku for quick queries, and specialized vision handling—without user intervention.

The routing approach is deliberately simple: prompt-based classification with route tokens at line start. This avoids extra API calls for complexity detection and keeps latency minimal. More sophisticated approaches (LLM-based pre-classification, multi-step detection) were rejected in [research.md](research.md) for cost and latency reasons.

This is a **breaking change** for configuration: the `model` field becomes `default_model`, and env var `CHLOE_MODEL` becomes `CHLOE_DEFAULT_MODEL`. The spec intentionally avoids backward compatibility to keep implementation clean—users will need to manually update their config files.

---

## Spec Review Guide (30 minutes)

> This guide helps you focus your 30 minutes on the parts of the spec and plan
> that need human judgment most.

### Understanding the approach (8 min)

Read [spec.md § Functional Requirements](spec.md#functional-requirements) (FR-006 through FR-012) for the core routing logic. As you read, consider:

- Is prompt-based classification via route tokens reliable enough? The model must output `[REASONING]` at line start to trigger a switch. What happens if the model forgets or outputs the token mid-line? See [FR-009](spec.md#functional-requirements) and [Edge Cases](spec.md#edge-cases) for the handling.

- Does the abort-restart pattern make sense for quality? When a route token is detected, the current stream is aborted and content discarded, then generation restarts with the target model. This ensures single-model coherence but wastes tokens. Is this acceptable given the expected early detection (first few lines)? See [research.md § Model Switching](research.md#3-model-switching-during-streaming).

- Why bypass route token detection for image inputs? The spec pre-routes images directly to vision_model. Is this the right choice, or should vision_model also output routing tokens like other models? See [FR-007](spec.md#functional-requirements).

### Key decisions that need your eyes (12 min)

**Config breaking change** ([spec.md FR-005](spec.md#functional-requirements), [plan.md § Constitution Check](plan.md#constitution-check))

The config field `model` becomes `default_model`, and the env var `CHLOE_MODEL` becomes `CHLOE_DEFAULT_MODEL`. Old fields are silently ignored, not auto-migrated. This keeps implementation simple but requires user action.

- Question for reviewer: Is the breaking change acceptable? Should we log a warning when old fields are detected, or silently ignore them? The spec says "silently ignore" ([FR-005](spec.md#functional-requirements)).

**Tool execution model** ([research.md § 5](research.md#5-tool-execution-model-switching), [spec.md FR-013-015](spec.md#functional-requirements))

The spec says "switch to default_model for tool execution." But research revealed that tools execute directly via `tool.execute(input)`—no model involved. The "switch" actually means the calling model triggers the tool call and receives results. This simplifies implementation significantly.

- Question for reviewer: Is this interpretation correct? The spec text says "default_model executes the tool" but the implementation pattern is direct execution. Should we clarify the spec language or change the implementation approach?

**Maximum 5 route switches** ([spec.md FR-016-017](spec.md#functional-requirements), [tasks.md T018](tasks.md#phase-3-user-story-1))

After 5 switches, the system forces default_model to complete. This prevents infinite loops from repeated route token outputs but may cut off legitimate complex workflows.

- Question for reviewer: Is 5 the right limit? What if a legitimate task needs 6+ model switches (e.g., complex reasoning → tool → vision → reasoning → tool → reasoning)? Should there be a warning before forcing, or just silent switch to default_model?

**Tool result route token detection** ([spec.md US5](spec.md#user-story-5), [FR-012](spec.md#functional-requirements))

Tool results can contain route tokens at line start, triggering model switches. This enables dynamic routing based on discovered complexity (e.g., reading a file reveals the task needs deeper analysis).

- Question for reviewer: Is this behavior desirable? Tool results might accidentally start with `[REASONING]` if file content happens to have that prefix. Should we filter route tokens from tool results, or accept the potential for unexpected switches?

### Areas where I'm less certain (5 min)

- [spec.md § Edge Cases](spec.md#edge-cases): "Empty response after route token" is mentioned but no task explicitly handles it. [research.md](research.md) says "attempt regeneration with target model" but this isn't in [tasks.md](tasks.md). Should we add explicit handling?

- [spec.md § Edge Cases](spec.md#edge-cases): "Invalid image path/URL" should "log warning, skip image, continue with text." But no task explicitly implements this graceful degradation. Should [tasks.md T021-T022](tasks.md#phase-4-user-story-2) include error handling?

- [plan.md § Constitution Check](plan.md#constitution-check): The constitution mentions `CHLOE_MODEL` env var, which is now `CHLOE_DEFAULT_MODEL`. [tasks.md T037](tasks.md#phase-8-polish) says to update constitution.md. Is this the right approach, or should we keep backward compatibility in constitution?

### Risks and open questions (5 min)

- If route tokens appear in file content read by `read_file` tool, will this trigger unintended model switches? See [FR-012](spec.md#functional-requirements) and [research.md § Tool Execution](research.md#5-tool-execution-model-switching). The spec says "line start only" detection, but file content could legitimately start with `[REASONING]` as actual text.

- The [routing-flows.md](routing-flows.md) shows abort-restart pattern but doesn't quantify token waste. How much content is typically discarded before a route token is detected? Is this acceptable for production use?

- [quickstart.md](quickstart.md) shows migration from old config format, but doesn't explain how users discover they need to update. Should CLI/API detect old config and print a warning? Or just silently use defaults?

---

## Prior Review Feedback

> This is the first review for this spec.

---

*Full context in linked [spec](spec.md), [plan](plan.md), and [tasks](tasks.md).*