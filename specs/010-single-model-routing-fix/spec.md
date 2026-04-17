# Feature Specification: Single-Model Routing Fix & Refactor Residue Cleanup

**Feature Branch**: `010-single-model-routing-fix`
**Created**: 2026-04-17
**Status**: Draft
**Input**: User description: "Fix behavior when only the default model is configured (multi-model routing with subagent tools should not activate), and clean up residue from the route-token → subagent-tool refactor in spec 009."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Single-model configuration behaves as single-model (Priority: P1)

A user installs Chloe and configures only `default_model` (or leaves it at its default). They do not set `reasoning_model`, `fast_model`, or `vision_model`. When they run a chat session, the agent should behave as a plain single-model agent: it should not be told about subagent/delegation tools, and those tools should not be registered or callable.

**Why this priority**: This is the most common configuration for new users. The current implementation exposes subagent tools and inserts a system prompt that instructs the model to delegate work — but every delegation call ends up invoking the same underlying model (via fallback), wasting API tokens and polluting the prompt with tools that have no useful distinct capability.

**Independent Test**: Start a session with config containing only `default_model`. Verify the agent's tool list does not include `vision_analyze`, `fast_query`, or `deep_reasoning`, and the system prompt sent to the API contains no subagent-related instructions. Send a normal message; the response is produced entirely by `default_model` without any subagent tool invocation.

**Acceptance Scenarios**:

1. **Given** a config where `reasoning_model`, `fast_model`, and `vision_model` are all unset (so they fall back to `default_model`), **When** the agent starts, **Then** `vision_analyze`, `fast_query`, and `deep_reasoning` are not registered in the tool registry.
2. **Given** that same config, **When** the agent sends a request to the model, **Then** no system prompt text about subagent tools is included in the request.
3. **Given** that same config, **When** a user sends a message containing an image path, **Then** the image is still handled correctly (image content blocks are built and sent to the default model; the absence of subagent tools does not break image input).
4. **Given** a config where the user explicitly sets each specialized model to the same string as `default_model`, **When** the agent starts, **Then** subagent tools are still not registered (behavior is driven by effective distinctness, not source).

---

### User Story 2 - Multi-model configuration still delegates as before (Priority: P2)

A user configures distinct models for `reasoning_model`, `fast_model`, or `vision_model` (at least one different from `default_model`). They expect the existing multi-model routing behavior — subagent tools available, system prompt guidance present — to continue working without regression.

**Why this priority**: Must preserve the value delivered by spec 009 for users who actually set up multiple models. Any regression here would invalidate the whole multi-model feature.

**Independent Test**: With a config where at least one specialized model differs from `default_model`, start a session. Verify all three subagent tools are registered, the subagent system prompt is included in API requests, and the agent can successfully invoke e.g. `fast_query` which then calls the configured fast model.

**Acceptance Scenarios**:

1. **Given** a config where only `fast_model` differs from `default_model`, **When** the agent starts, **Then** all three subagent tools are registered and the subagent system prompt is attached.
2. **Given** a config where all three specialized models differ from `default_model`, **When** the agent invokes `deep_reasoning`, **Then** the inner API call targets the configured `reasoning_model`.
3. **Given** a user message with an image in a multi-model config, **When** the agent selects the initial model, **Then** `vision_model` is used for the initial call, matching the behavior defined in spec 009.

---

### User Story 3 - Callers that inject custom tools control their own prompt surface (Priority: P2)

A caller (e.g., a test or embedding integration) passes an explicit `tools` array to `createAgent`. They expect the agent to use exactly those tools — no auto-injection of subagent tools, no auto-injection of subagent system prompt.

**Why this priority**: The current code already skips subagent tool registration when `config.tools` is provided, but the system prompt is still attached unconditionally. This means a caller that supplies its own tool set still gets told to delegate to tools that don't exist. Fixing this is required for the system prompt to stay coherent.

**Independent Test**: Create an agent with an explicit `tools: []` array. Verify no subagent tools are registered AND the system prompt sent to the API does not reference subagent tools.

**Acceptance Scenarios**:

1. **Given** `createAgent({ tools: [] })`, **When** the agent sends a request, **Then** the API call contains no subagent tools and no subagent system prompt.
2. **Given** `createAgent({ tools: [customTool] })`, **When** the agent lists its tools to the model, **Then** only `customTool` is listed.

---

### User Story 4 - Developer reading the codebase sees no refactor residue (Priority: P3)

A developer (internal contributor or reviewer) opens the multi-model routing code after the route-token → subagent-tool refactor. They expect to see a coherent codebase: no dead types, no dead function parameters, no abandoned parallel implementations, no test comments referring to concepts that no longer exist, and no spec documents that contradict the code.

**Why this priority**: Residue left by the previous refactor makes the code harder to understand and harder to extend. Some of the residue (e.g., the dead non-routing loop implementation) is actively misleading because tests reference it but production doesn't. This is a correctness-adjacent concern: future bugs will be harder to prevent if the spec and code disagree.

**Independent Test**: Walk the diff introduced by this feature and confirm: unused types are removed, unused function parameters are removed, exactly one ReAct loop implementation exists (used by production and by tests), test comments describe the behavior they actually assert, and `specs/009-multi-model-routing/` either reflects the current subagent-tool design or clearly marks route-token sections as superseded.

**Acceptance Scenarios**:

1. **Given** the current code, **When** a developer searches for `ToolCallContext`, **Then** no definition exists.
2. **Given** the current code, **When** a developer inspects `RoutingState`, **Then** it contains only fields that are actually read by the loop.
3. **Given** the current code, **When** a developer inspects the options type accepted by the production ReAct loop, **Then** every declared field is read somewhere inside the loop.
4. **Given** the current code, **When** a developer greps for loop function definitions, **Then** there is exactly one loop implementation, and it is used by both the production agent and the loop tests.
5. **Given** the loop test file, **When** a developer reads the comments, **Then** no comment references "route token detection" or other removed concepts.
6. **Given** `specs/009-multi-model-routing/`, **When** a developer reads it to understand the current behavior, **Then** the documents either describe the subagent-tool design or explicitly point to this spec (010) for the current design.

---

### Edge Cases

- What happens when `default_model` is also unset (config entirely missing)? The existing built-in default is used; the agent still counts as single-model and subagent tools remain unregistered.
- What happens when a user sets e.g. `reasoning_model` equal to `default_model` explicitly (same string)? Still treated as single-model — subagent tools stay unregistered. Detection is based on the effective resolved configuration, not on whether the user typed the value.
- What happens when a partial multi-model config is given (e.g., `fast_model` set but `reasoning_model` and `vision_model` unset and therefore fall back to `default_model`)? The agent is considered multi-model and all three subagent tools are registered. Individual subagent tools whose target model equals `default_model` remain functionally redundant but are acceptable — if the user configured *any* differentiation, they have opted into the multi-model prompt surface.
- What happens when a consumer passes `config.tools` with custom tools that include names colliding with `vision_analyze` / `fast_query` / `deep_reasoning`? The caller's tools win; no auto-registration happens when `config.tools` is provided, so no collision is possible.
- What happens during a session that was started with a single-model config but the user changes config mid-session? Out of scope — agent configuration is read at construction time; changes take effect on next session start.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The agent MUST register the subagent delegation tools (`vision_analyze`, `fast_query`, `deep_reasoning`) only when the effective resolved model configuration contains at least one specialized model (reasoning / fast / vision) that differs from `default_model`.
- **FR-002**: When no specialized model differs from `default_model`, the agent MUST NOT register any subagent delegation tool.
- **FR-003**: The agent MUST include subagent-related guidance in the system prompt sent to the model only in requests where at least one subagent tool is actually available in the tool registry.
- **FR-004**: When no subagent tool is registered (for any reason — single-model config OR caller-supplied tool list), the system prompt sent to the model MUST NOT contain subagent delegation guidance.
- **FR-005**: When a caller supplies an explicit `tools` array to the agent constructor, the agent MUST NOT auto-register subagent tools (existing behavior — must be preserved) AND MUST NOT include subagent system prompt text.
- **FR-006**: The multi-model behavior in spec 009 (initial model selection based on image detection, subagent tool delegation to configured specialized models) MUST continue to work unchanged when multi-model configuration is present.
- **FR-007**: The production ReAct loop invocation path MUST have direct unit test coverage. Tests MUST exercise the actual production function (not a parallel abandoned implementation).
- **FR-008**: The codebase MUST NOT contain type declarations or struct fields that are defined but never read. Specifically, `ToolCallContext` and any unused fields of `RoutingState` MUST be removed.
- **FR-009**: The options type accepted by the production ReAct loop MUST NOT declare parameters that are never read by the loop body. Unused parameters MUST be removed from both the type and the callsite.
- **FR-010**: The codebase MUST contain exactly one production ReAct loop implementation. A parallel loop that is referenced only by its own tests MUST be either removed OR merged into the production loop, at the author's discretion.
- **FR-011**: Test comments in the loop test file MUST accurately describe the behavior under test. References to "route tokens" or any other removed concept MUST be removed or rewritten.
- **FR-012**: `specs/009-multi-model-routing/` MUST either be updated to reflect the current subagent-tool design, OR be marked (e.g., via a prominent note at the top of each superseded document) as superseded by spec 010 with a pointer to the current design. The choice between "update in place" and "mark superseded" is at the author's discretion, but the end state MUST leave no ambiguity about which design the code implements.
- **FR-013**: Single-model behavior MUST be covered by at least one unit test that asserts (a) subagent tools are absent from the registry and (b) subagent system prompt text is absent from API requests.
- **FR-014**: Multi-model behavior MUST be covered by at least one unit test that asserts (a) all three subagent tools are registered and (b) subagent system prompt text is included in API requests.

### Key Entities *(include if feature involves data)*

- **Effective model configuration**: The resolved set of four model identifiers (`default`, `reasoning`, `fast`, `vision`) after environment variables, config file values, and built-in defaults are merged and fallbacks are applied. This is the input to the single-vs-multi-model decision.
- **Multi-model mode flag**: A derived boolean that is `true` if at least one specialized model in the effective configuration differs from `default_model`, and `false` otherwise. Drives subagent tool registration and subagent system prompt inclusion.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In a session started with single-model configuration, zero subagent tool invocations occur across a representative workload of 20 mixed requests (text-only, image-bearing, multi-turn). The number of API calls to specialized models equals zero; all calls target `default_model`.
- **SC-002**: In a session started with multi-model configuration (all four models distinct), the existing multi-model behavior from spec 009 remains intact: image-bearing messages route to `vision_model` initially, and subagent tool invocations (when the model chooses them) hit the configured specialized model.
- **SC-003**: The codebase contains exactly one production ReAct loop implementation, verifiable by confirming every loop function definition is reachable from a production entry point (`Agent.run`).
- **SC-004**: A search of the codebase for the names `ToolCallContext`, `detectRouteToken`, `checkLineStart`, `RouteTokenType`, `ROUTE_TOKENS`, `MAX_ROUTE_SWITCHES` produces zero matches under `packages/`. Matches inside `specs/` are acceptable only if the containing document explicitly describes a superseded design.
- **SC-005**: Every parameter declared on the production ReAct loop's options type is read at least once inside the loop body, verifiable by inspection.
- **SC-006**: The loop test file contains zero occurrences of the string "route token" (case-insensitive) in comments or test descriptions.
- **SC-007**: The existing `bun test` suite passes with no reduction in test count attributable to removed-but-not-replaced coverage; if the legacy non-routing loop is removed, its unique test scenarios are ported to cover the surviving loop.
- **SC-008**: `bunx tsc --noEmit -p tsconfig.check.json` and `bunx biome check --error-on-warnings .` both pass.
- **SC-009**: A reader of `specs/009-multi-model-routing/` can determine, within 30 seconds of opening any of its documents, whether that document describes current behavior or superseded behavior.

## Assumptions

- "Single-model" is defined by the effective resolved configuration, not by what the user typed. Users who explicitly set `fast_model = default_model` get the same behavior as users who leave `fast_model` unset.
- Image handling in single-model mode remains the responsibility of the default model. If the default model does not support images, image requests may fail or degrade — this is the user's configuration choice and is out of scope for this feature.
- The subagent tools' internal recursion-prevention check (tools refusing to call themselves when they detect `callingTool === self`) is retained as defensive code even though the current implementation makes it impossible to trigger. Removing it is not required by this feature.
- Residue cleanup (US4) is scoped to items identified during the audit preceding this spec. Broader cleanup of the codebase is out of scope.
- Updating `specs/009-multi-model-routing/` in full to match current behavior is optional; the minimum acceptable outcome is unambiguous marking of superseded sections.
