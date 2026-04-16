# Feature Specification: Multi-Model Routing System

**Feature Branch**: `009-multi-model-routing`
**Created**: 2026-04-16
**Status**: Draft
**Input**: Multi-model routing system supporting default_model, reasoning_model, fast_model, and vision_model with automatic request routing based on content analysis.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Basic Text Request Routing (Priority: P1)

User sends a text-only message without images. System uses default_model as initial model, monitors for route tokens at line start, and switches to appropriate model if detected.

**Why this priority**: Core routing functionality - enables automatic model selection for most common use case (text requests).

**Independent Test**: Can be fully tested by sending various text messages and verifying model selection based on route tokens output.

**Acceptance Scenarios**:

1. **Given** user sends "What is the capital of France?", **When** default_model outputs `[FAST]` at line start, **Then** system switches to fast_model (or fallback to default_model if unset)
2. **Given** user sends "Analyze the architectural trade-offs between microservices and monolith", **When** default_model outputs `[REASONING]` at line start, **Then** system switches to reasoning_model (or fallback to default_model if unset)
3. **Given** user sends a simple greeting, **When** default_model outputs no route token, **Then** default_model continues generating response without switching

---

### User Story 2 - Image Input Routing (Priority: P1)

User provides image input (local file path or URL) in their message. System detects image before request and routes directly to vision_model, bypassing route token detection.

**Why this priority**: Image handling is a distinct capability requiring specialized model - enables multimodal interactions.

**Independent Test**: Can be fully tested by sending messages with image paths/URLs and verifying vision_model is used directly.

**Acceptance Scenarios**:

1. **Given** user sends "Describe this image: /path/to/screenshot.png", **When** system detects image path, **Then** vision_model handles request without route token detection
2. **Given** user sends "What's in this photo? https://example.com/image.jpg", **When** system detects image URL, **Then** vision_model handles request
3. **Given** user sends image but vision_model is unset, **When** system processes request, **Then** fallback to default_model (may have limited image capability)

---

### User Story 3 - Tool Call Model Switching (Priority: P2)

During response generation, any model triggers a tool call (e.g., read_file, bash). System switches to default_model for tool execution, then returns results to the calling model to continue.

**Why this priority**: Ensures consistent tool execution while maintaining reasoning context. Required for complex multi-step operations.

**Independent Test**: Can be fully tested by triggering tool calls from different models and verifying default_model executes tools while calling model continues processing.

**Acceptance Scenarios**:

1. **Given** reasoning_model is generating response and calls read_file tool, **When** tool execution begins, **Then** default_model executes the tool
2. **Given** default_model executed tool and returned result, **When** result is available, **Then** reasoning_model continues processing the result
3. **Given** multiple sequential tool calls are needed, **When** each tool is called, **Then** each is executed by default_model independently before returning to calling model

---

### User Story 4 - Configuration and Fallback (Priority: P2)

User configures model settings via TOML file or environment variables. System loads configurations with proper priority and handles unset models by falling back to default_model.

**Why this priority**: Configuration flexibility enables users to customize model selection for their needs and budget.

**Independent Test**: Can be fully tested by setting various config combinations and verifying correct model selection and fallback behavior.

**Acceptance Scenarios**:

1. **Given** config has default_model="claude-sonnet-4-6" and reasoning_model unset, **When** route token `[REASONING]` detected, **Then** default_model handles request (fallback)
2. **Given** env var CHLOE_FAST_MODEL="claude-haiku-4-5" set, **When** config file has different fast_model, **Then** env var value is used (higher priority)
3. **Given** config has old "model" field only, **When** system loads config, **Then** field is ignored, default_model defaults to "claude-sonnet-4-6"

---

### User Story 5 - Tool Result Route Token Detection (Priority: P3)

Tool execution returns content containing route tokens at line start. System detects these tokens and triggers model switching, similar to initial request routing.

**Why this priority**: Enables dynamic routing based on tool results - useful when tool output reveals task complexity that wasn't apparent initially.

**Independent Test**: Can be fully tested by having tools return content with route tokens and verifying switching behavior.

**Acceptance Scenarios**:

1. **Given** default_model executes read_file and file content starts with `[REASONING]`, **When** result returned to calling model, **Then** system switches to reasoning_model
2. **Given** tool result contains `[REASONING]` not at line start, **When** result processed, **Then** no route switch triggered (line start only)
3. **Given** reasoning_model processing tool result detects `[FAST]` at line start, **When** result returned, **Then** system switches to fast_model

---

### Edge Cases

- What happens when route tokens appear in user's original message? System treats them as normal content, not routing triggers - only model output triggers routing.
- How does system handle maximum route switches limit? After 5 switches, system forces default_model to complete response, preventing infinite loops.
- What happens when model outputs empty response after route token? System attempts regeneration with target model; if still empty, returns empty to user with warning log.
- How does system handle concurrent route tokens in tool results? Each route token detection triggers independent switch; system processes sequentially.
- What happens when image path/URL is invalid or unreachable? System logs warning, skips image processing, continues with text-only request.

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
- **FR-007**: System MUST route image-containing requests directly to `vision_model`, bypassing route token detection
- **FR-008**: System MUST use `default_model` as initial model for text-only requests
- **FR-009**: System MUST detect route tokens `[REASONING]`, `[VISION]`, `[FAST]` at line start during streaming generation
- **FR-010**: System MUST switch to target model when route token detected, discarding already-generated content
- **FR-011**: System MUST continue with `default_model` when no route token detected
- **FR-012**: System MUST detect route tokens in tool execution results and trigger switching

**Tool Execution**

- **FR-013**: System MUST switch to `default_model` for all tool executions regardless of calling model
- **FR-014**: System MUST return tool results to the original calling model for continued processing
- **FR-015**: System MUST handle each tool call independently with separate `default_model` invocation

**Safety Limits**

- **FR-016**: System MUST limit maximum route switches to 5 per request to prevent infinite loops
- **FR-017**: System MUST force `default_model` completion after switch limit reached

### Key Entities

- **ModelConfig**: Configuration entity containing default_model, reasoning_model, fast_model, vision_model values with fallback logic
- **ModelRouter**: Routing decision entity that analyzes request content (images, route tokens) and selects target model
- **RoutingRunLoop**: Enhanced execution loop that monitors streaming output for route tokens and coordinates model switching
- **ToolExecutor**: Independent tool execution entity using default_model for all tool calls

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Image-containing requests route to vision_model 100% of the time when vision_model is configured
- **SC-002**: Route token `[REASONING]` at line start triggers reasoning_model switch 100% of the time when reasoning_model is configured
- **SC-003**: Route token `[FAST]` at line start triggers fast_model switch 100% of the time when fast_model is configured
- **SC-004**: Unset model types correctly fallback to default_model without errors
- **SC-005**: Tool executions are performed by default_model 100% of the time regardless of calling model
- **SC-006**: Tool results correctly return to calling model 100% of the time
- **SC-007**: Route switches stop after reaching 5-switch limit, default_model completes response
- **SC-008**: Legacy `model` config field is silently ignored, no errors raised
- **SC-009**: Config priority correctly applies: env vars override TOML, TOML overrides defaults

## Assumptions

- Users will manually update config from `model` to `default_model` field (breaking change documentation required)
- Route tokens are output by model within first few lines of generation (minimal token waste on switch)
- Anthropic API supports all configured model IDs (claude-opus-4-6, claude-sonnet-4-6, claude-haiku-4-5)
- Image URLs are accessible and within reasonable size limits for API processing
- Local image paths exist and are readable by the system
- Vision_model has multimodal capability (can process images with text)
- Default model has sufficient tool execution capability for all registered tools