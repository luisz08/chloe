# Feature Specification: Multi-Model Routing System

> **SUPERSEDED BY spec 010**: This document describes the route-token design, which was replaced by subagent tools. See `specs/010-single-model-routing-fix/` for the current design.

**Feature Branch**: `009-multi-model-routing`
**Created**: 2026-04-16
**Updated**: 2026-04-17
**Status**: Draft
**Input**: Multi-model routing system supporting default_model, reasoning_model, fast_model, and vision_model with subagent tool delegation.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Basic Text Request (Priority: P1)

User sends a text-only message without images. System uses default_model for all text requests.

**Why this priority**: Core functionality - handles most common use case.

**Independent Test**: Can be fully tested by sending text messages and verifying default_model is used.

**Acceptance Scenarios**:

1. **Given** user sends "What is the capital of France?", **When** system processes request, **Then** default_model handles request
2. **Given** user sends "Analyze the architectural trade-offs", **When** system processes request, **Then** default_model handles request, may call deep_reasoning subagent for complex analysis
3. **Given** user sends a simple greeting, **When** system processes request, **Then** default_model handles request without subagent calls

---

### User Story 2 - Image Input Routing (Priority: P1)

User provides image input (local file path or URL) in their message. System detects image before request and routes directly to vision_model.

**Why this priority**: Image handling is a distinct capability requiring specialized model - enables multimodal interactions.

**Independent Test**: Can be fully tested by sending messages with image paths/URLs and verifying vision_model is used directly.

**Acceptance Scenarios**:

1. **Given** user sends "Describe this image: /path/to/screenshot.png", **When** system detects image path, **Then** vision_model handles request
2. **Given** user sends "What's in this photo? https://example.com/image.jpg", **When** system detects image URL, **Then** vision_model handles request
3. **Given** user sends image but vision_model is unset, **When** system processes request, **Then** fallback to default_model (may have limited image capability)

---

### User Story 3 - Subagent Tool Delegation (Priority: P1)

During conversation, the main model delegates specialized tasks to subagent tools. Each subagent makes a single API call to its designated model and returns results to the main model.

**Why this priority**: Enables dynamic model delegation when model discovers it needs specialized capabilities.

**Independent Test**: Can be fully tested by triggering subagent tool calls and verifying correct model is used.

**Acceptance Scenarios**:

1. **Given** user sends "帮我分析 ./dist/image.png 的内容" without initial image detection, **When** model decides it needs visual analysis, **Then** model calls vision_analyze tool which uses vision_model
2. **Given** model encounters a simple lookup task mid-conversation, **When** model calls fast_query tool, **Then** fast_model handles the query and returns result
3. **Given** model encounters complex reasoning requirement, **When** model calls deep_reasoning tool, **Then** reasoning_model analyzes and returns result
4. **Given** model calls subagent tool, **When** subagent returns result, **Then** main model continues processing with result

---

### User Story 4 - Subagent Recursion Prevention (Priority: P2)

Subagent tools cannot call themselves recursively. System tracks currently executing tool and blocks recursive self-calls.

**Why this priority**: Prevents infinite loops and resource waste.

**Independent Test**: Can be fully tested by attempting recursive subagent calls and verifying error response.

**Acceptance Scenarios**:

1. **Given** vision_analyze tool is executing, **When** it attempts to call vision_analyze again, **Then** error message returned instead of API call
2. **Given** fast_query tool is executing, **When** it attempts to call fast_query again, **Then** recursion blocked with error
3. **Given** deep_reasoning tool is executing, **When** it attempts to call deep_reasoning again, **Then** recursion blocked with error

---

### User Story 5 - Configuration and Fallback (Priority: P2)

User configures model settings via TOML file or environment variables. System loads configurations with proper priority and handles unset models by falling back to default_model.

**Why this priority**: Configuration flexibility enables users to customize model selection.

**Independent Test**: Can be fully tested by setting various config combinations and verifying correct model selection and fallback behavior.

**Acceptance Scenarios**:

1. **Given** config has default_model="claude-sonnet-4-6" and reasoning_model unset, **When** deep_reasoning tool is called, **Then** default_model handles request (fallback)
2. **Given** env var CHLOE_FAST_MODEL="claude-haiku-4-5" set, **When** config file has different fast_model, **Then** env var value is used (higher priority)
3. **Given** config has old "model" field only, **When** system loads config, **Then** field is ignored, default_model defaults to "claude-sonnet-4-6"

---

### Edge Cases

- What happens when image path/URL is invalid or unreachable? System logs warning, skips image processing, continues with text-only request.
- What happens when subagent tool is called without required parameters? Tool returns error message indicating missing required input.
- What happens when model calls multiple subagents in sequence? Each subagent executes independently, results return to main model for processing.

## Requirements *(mandatory)*

### Functional Requirements

**Configuration**

- **FR-001**: System MUST support four model configuration fields: `default_model`, `reasoning_model`, `fast_model`, `vision_model` in TOML config
- **FR-002**: System MUST support environment variables: `CHLOE_DEFAULT_MODEL`, `CHLOE_REASONING_MODEL`, `CHLOE_FAST_MODEL`, `CHLOE_VISION_MODEL`
- **FR-003**: Config priority MUST follow: env var > TOML file > hardcoded default ("claude-sonnet-4-6")
- **FR-004**: System MUST fallback unset model types to `default_model` value
- **FR-005**: System MUST ignore legacy `model` config field (breaking change - no auto-migration)

**Routing Strategy**

- **FR-006**: System MUST detect image inputs (local file paths and URLs) before request processing
- **FR-007**: System MUST route image-containing requests directly to `vision_model`
- **FR-008**: System MUST use `default_model` for all text-only requests
- **FR-009**: System MUST provide subagent tools for model delegation (not route tokens)

**Subagent Tools**

- **FR-010**: System MUST provide three subagent tools: `vision_analyze`, `fast_query`, `deep_reasoning`
- **FR-011**: Subagent tools MUST make single API call to designated model and return text result
- **FR-012**: `vision_analyze` MUST accept `path`, `url`, and `prompt` parameters, use `vision_model`
- **FR-013**: `fast_query` MUST accept `query` parameter, use `fast_model`
- **FR-014**: `deep_reasoning` MUST accept `problem` and optional `context` parameters, use `reasoning_model`
- **FR-015**: Subagent tools MUST block recursive self-calls (cannot call themselves)
- **FR-016**: System MUST track currently executing tool name for recursion prevention
- **FR-017**: Subagent tools MUST return error message when required parameters missing

**System Prompt**

- **FR-018**: System MUST include guidance in system prompt for when to use each subagent tool

### Key Entities

- **ModelConfig**: Configuration entity containing default_model, reasoning_model, fast_model, vision_model values with fallback logic
- **SubagentToolFactory**: Factory functions creating subagent tools with Anthropic client and model config access
- **ToolRegistry**: Tool registry with callingTool tracking for recursion prevention

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Image-containing requests route to vision_model 100% of the time when vision_model is configured
- **SC-002**: Unset model types correctly fallback to default_model without errors
- **SC-003**: Legacy `model` config field is silently ignored, no errors raised
- **SC-004**: Config priority correctly applies: env vars override TOML, TOML overrides defaults
- **SC-005**: Subagent tools correctly call designated models 100% of the time
- **SC-006**: Subagent recursion prevention blocks self-calls 100% of the time
- **SC-007**: Subagent tools return error for missing required parameters
- **SC-008**: Main model correctly processes subagent results 100% of the time

## Assumptions

- Users will manually update config from `model` to `default_model` field (breaking change documentation required)
- Anthropic API supports all configured model IDs (claude-opus-4-7, claude-sonnet-4-6, claude-haiku-4-5)
- Image URLs are accessible and within reasonable size limits for API processing
- Local image paths exist and are readable by the system
- Vision_model has multimodal capability (can process images with text)
- Default model has sufficient tool execution capability for all registered tools
- Subagent tools are invoked by main model via standard tool call mechanism
- Main model decides when to use subagent tools based on system prompt guidance