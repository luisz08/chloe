# Data Model: Multi-Model Routing System

> **SUPERSEDED BY spec 010**: This document describes the route-token design, which was replaced by subagent tools. See `specs/010-single-model-routing-fix/` for the current design.

**Feature**: 009-multi-model-routing
**Date**: 2026-04-16

## Entities

### ModelConfig

Configuration entity containing model IDs with fallback logic.

**Fields**:
| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| defaultModel | string | Yes | "claude-sonnet-4-6" | Primary model for requests |
| reasoningModel | string | No | (fallback to defaultModel) | Model for complex reasoning tasks |
| fastModel | string | No | (fallback to defaultModel) | Model for quick queries |
| visionModel | string | No | (fallback to defaultModel) | Model for image processing |

**Validation Rules**:
- `defaultModel` must be valid Anthropic model ID
- Optional models can be empty string → triggers fallback
- Model IDs must match Anthropic supported models

**State**: Immutable after loading from config/env

---

### ImageInput

Detected image input from user message.

**Fields**:
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| type | "path" \| "url" | Yes | Image source type |
| value | string | Yes | Path or URL string |
| mediaType | string | No | MIME type (derived from extension) |

**Validation Rules**:
- Path must resolve to existing file (checked at execution)
- URL must be accessible (checked at execution)
- Supported formats: png, jpg, jpeg, gif, webp, bmp

---

### RouteToken

Detected routing token from model output.

**Fields**:
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| token | "REASONING" \| "FAST" \| "VISION" | Yes | Token type |
| position | number | Yes | Byte position in stream |
| lineIndex | number | Yes | Line number in output |

**Validation Rules**:
- Must appear at line start (column 0)
- Case-sensitive exact match
- No whitespace prefix

---

### RoutingState

State tracking for routing during request processing.

**Fields**:
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| currentModel | string | Yes | Currently active model |
| routeCount | number | Yes | Number of switches (0-5) |
| callingModel | string | No | Model that triggered tool call |
| pendingToolCalls | ToolCall[] | No | Tools waiting for execution |

**State Transitions**:
```
[Initial] → routeCount=0, currentModel=defaultModel (or visionModel if image)
[TokenDetected] → routeCount++, currentModel=targetModel
[ToolCall] → callingModel=currentModel, pendingToolCalls+=call
[ToolResult] → pendingToolCalls-=call, check routeToken in result
[LimitReached] → currentModel=defaultModel (forced), no more switching
```

---

### ToolCallContext

Context for tool execution with model tracking.

**Fields**:
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| toolUseId | string | Yes | Anthropic tool_use block ID |
| toolName | string | Yes | Tool name to execute |
| toolInput | unknown | Yes | Tool input parameters |
| callingModel | string | Yes | Model that triggered this call |

---

## Relationships

```
ChloeConfig
    └── ModelConfig (new, part of provider config)
        └── resolves to targetModel based on RouteToken

RoutingRunLoop
    └── RoutingState
        ├── currentModel (string)
        ├── routeCount (number)
        └── callingModel (string, during tool execution)

ImageInput[] (detected from user message)
    └── triggers pre-routing to visionModel

RouteToken (detected from model output)
    └── triggers model switch to targetModel

ToolCallContext (during tool execution)
    └── preserves callingModel for result return
```

---

## Data Flow

```
User Message
    │
    ├─► ImageDetection
    │       └─► ImageInput[]
    │               └─► Pre-route to visionModel
    │
    └─► RoutingRunLoop
            │
            ├─► ModelRouter.selectInitialModel()
            │       └─► ModelConfig (defaultModel or visionModel)
            │
            ├─► Stream Generation
            │       │
            │       ├─► RouteTokenDetector
            │       │       └─► RouteToken (or null)
            │       │               └─► ModelRouter.resolveTargetModel()
            │       │                       └─► RoutingState update
            │       │                               └─► Restart with new model
            │       │
            │       ├─► ToolCall detected
            │       │       └─► ToolCallContext created
            │       │               ├─► callingModel = currentModel
            │       │               └─► tool.execute()
            │       │                       └─► Result returned to callingModel
            │       │                               └─► RouteToken check in result
            │       │
            │       └─► Response complete
            │               └─► RunResult returned
```

---

## Storage Considerations

**No new storage required** - routing is ephemeral per request:
- RoutingState lives only during request processing
- ModelConfig stored in existing config.toml
- ImageInput handled inline (base64 conversion)
- RouteToken detected and processed immediately

**Config File Changes**:
- TOML section `[provider]` extended
- Fields added: `default_model`, `reasoning_model`, `fast_model`, `vision_model`
- Breaking: old `model` field ignored