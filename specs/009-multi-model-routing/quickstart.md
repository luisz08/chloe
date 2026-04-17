# Quickstart: Multi-Model Routing

> **SUPERSEDED BY spec 010**: This document describes the route-token design, which was replaced by subagent tools. See `specs/010-single-model-routing-fix/` for the current design.

**Feature**: 009-multi-model-routing
**Date**: 2026-04-16

## Overview

Multi-model routing automatically selects the best model for each request based on:
- **Image input**: Routes to `vision_model`
- **Complex reasoning**: Routes to `reasoning_model` (detected by `[REASONING]` token)
- **Quick queries**: Routes to `fast_model` (detected by `[FAST]` token)
- **Default**: Uses `default_model` for moderate tasks

---

## Configuration

### TOML Config

Create or update `~/.chloe/settings/config.toml`:

```toml
[provider]
api_key = "sk-ant-api03-..."
default_model = "claude-sonnet-4-6"
reasoning_model = "claude-opus-4-6"    # Optional
fast_model = "claude-haiku-4-5-20251001"  # Optional
vision_model = "claude-sonnet-4-6"    # Optional (same as default OK)
```

### Environment Variables

```bash
# Required
export CHLOE_API_KEY="sk-ant-api03-..."

# Optional - model selection
export CHLOE_DEFAULT_MODEL="claude-sonnet-4-6"
export CHLOE_REASONING_MODEL="claude-opus-4-6"
export CHLOE_FAST_MODEL="claude-haiku-4-5-20251001"
export CHLOE_VISION_MODEL="claude-sonnet-4-6"
```

---

## Usage Examples

### Basic Text Request

```bash
chloe chat "What is the capital of France?"
# → Uses default_model
# → If model outputs [FAST], switches to fast_model
```

### Complex Reasoning Request

```bash
chloe chat "Analyze the architectural trade-offs between microservices and monolith for a fintech startup"
# → Uses default_model initially
# → Model outputs [REASONING] at line start
# → Switches to reasoning_model for deep analysis
```

### Image Request

```bash
chloe chat "Describe what's in this screenshot: ./images/bug-report.png"
# → Pre-routes to vision_model (image detected)
# → Bypasses route token detection
```

### Image URL

```bash
chloe chat "What does this diagram show? https://example.com/architecture.png"
# → Pre-routes to vision_model (URL detected)
```

---

## Model Selection Logic

| Input Type | Initial Model | Can Switch? | Final Model |
|------------|---------------|-------------|-------------|
| Text only | `default_model` | Yes (on token) | Token target or `default_model` |
| Image present | `vision_model` | Yes (on token) | Token target or `vision_model` |
| After route switch | Target model | Yes (continue) | Until limit or completion |
| After tool call | Calling model | Yes (in result) | Token in result triggers switch |

---

## Route Tokens

The model may output these tokens at the **start of a line**:

| Token | Meaning | Target Model |
|-------|---------|--------------|
| `[REASONING]` | Complex analysis needed | `reasoning_model` |
| `[FAST]` | Simple quick query | `fast_model` |
| `[VISION]` | Image analysis (rare, usually pre-routed) | `vision_model` |

**Example Model Output**:
```
[REASONING]
Let me analyze this step by step...

1. First, consider the requirements...
```

---

## Safety Limit

Maximum **5 route switches** per request. After limit, `default_model` completes the response to prevent infinite loops.

---

## Migration from Old Config

If you have existing config with `model` field:

```toml
# OLD (ignored)
[provider]
model = "claude-sonnet-4-6"

# NEW (required)
[provider]
default_model = "claude-sonnet-4-6"
```

Update manually - no auto-migration provided.

---

## Troubleshooting

### Route Token Not Triggering Switch

- Token must be at **line start** (no spaces before)
- Token must be exact: `[REASONING]`, `[FAST]`, `[VISION]`
- Target model must be configured or fallback applies

### Image Not Detected

- Check file extension: `.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`, `.bmp`
- URL must have image extension in path
- Local path must exist (validated at execution)

### Model Switching Too Often

- Check if model outputs tokens repeatedly
- Limit of 5 switches enforced
- Consider simplifying prompt if over-triggering