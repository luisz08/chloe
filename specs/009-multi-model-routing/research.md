# Research: Multi-Model Routing System

> **SUPERSEDED BY spec 010**: This document describes the route-token design, which was replaced by subagent tools. See `specs/010-single-model-routing-fix/` for the current design.

**Feature**: 009-multi-model-routing
**Date**: 2026-04-16

## Research Topics

### 1. Anthropic API Model Selection

**Question**: How does Anthropic SDK handle model selection in streaming API?

**Decision**: Pass model ID string to `client.messages.stream({ model, ... })`. Each call can use different model.

**Findings**:
- Current implementation: `model` passed as string parameter to `client.messages.stream()`
- Model IDs supported: `claude-opus-4-6`, `claude-sonnet-4-6`, `claude-haiku-4-5-20251001`
- Model can be changed per API call without client re-initialization
- Same `Anthropic` client instance works for all models

**Code Pattern** (from loop.ts:24-29):
```typescript
const stream = client.messages.stream({
  model,        // ← model ID passed here
  max_tokens: 4096,
  tools: tools.list(),
  messages,
});
```

**Rationale**: Simpler than creating separate client instances. One client, multiple model calls.

**Alternatives Considered**:
- Separate client per model: Rejected - unnecessary overhead, same API key works for all models
- Dynamic client selection: Rejected - adds complexity without benefit

---

### 2. Streaming Route Token Detection

**Question**: How to detect route tokens at line start during streaming?

**Decision**: Buffer text deltas, detect line breaks, check each line start for route token pattern.

**Findings**:
- Current streaming: `for await (const event of stream)` with `event.delta.text` accumulation
- Text deltas are character-by-character or chunk-by-chunk
- Route tokens: `[REASONING]`, `[FAST]`, `[VISION]` - 12-14 characters
- Need to buffer until newline, then check line start

**Implementation Pattern**:
```typescript
let buffer = "";
let lineStart = true;

for await (const event of stream) {
  if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
    const text = event.delta.text;

    for (const char of text) {
      buffer += char;

      if (char === '\n') {
        // Check if line start matches route token
        const line = buffer.slice(0, -1); // exclude newline
        if (lineStart && isRouteToken(line)) {
          // Trigger routing switch
          return { routeToken: detectRouteToken(line) };
        }
        buffer = "";
        lineStart = true;
      } else {
        lineStart = false; // after first char, not line start
      }
    }

    callbacks.onToken?.(text);
  }
}
```

**Rationale**: Line-by-line detection avoids false triggers from route tokens appearing mid-content.

**Alternatives Considered**:
- Full response post-processing: Rejected - can't switch during generation
- Token-by-token regex: Rejected - false triggers on partial matches

---

### 3. Model Switching During Streaming

**Question**: How to handle model switch when route token detected?

**Decision**: Abort current stream, discard buffered content, start new stream with target model.

**Findings**:
- Current loop: `for (;;)` with single model per iteration
- Need ability to break loop mid-stream and restart
- `client.messages.stream()` returns async iterable - can break early
- Messages array preserved from previous turns

**Implementation Pattern**:
```typescript
async function routingRunLoop(options: RoutingLoopOptions): Promise<RunResult> {
  const { client, modelRouter, tools, callbacks, routeCount = 0 } = options;

  if (routeCount >= MAX_ROUTE_SWITCHES) {
    // Safety limit - force default_model
    return runLoopWithModel({ ...options, model: options.config.defaultModel });
  }

  const stream = client.messages.stream({
    model: modelRouter.selectInitialModel(options),
    max_tokens: 4096,
    tools: tools.list(),
    messages: options.messages,
  });

  try {
    for await (const event of stream) {
      // ... handle text deltas with route detection

      if (routeDetected) {
        // Abort current stream
        stream.abort(); // or break

        // Discard buffered content, switch model
        const targetModel = modelRouter.resolveTargetModel(routeToken);

        // Restart with target model (increment route count)
        return routingRunLoop({
          ...options,
          model: targetModel,
          routeCount: routeCount + 1,
        });
      }
    }
  } catch (abortError) {
    // Stream aborted for routing - expected, continue
  }
}
```

**Rationale**: Clean abort-restart pattern. No partial response stitching. Quality maintained by single-model generation.

**Alternatives Considered**:
- Continue with buffered + new model: Rejected - style discontinuity, logic gaps
- Pause and resume: Rejected - API doesn't support mid-stream model change

---

### 4. Image Input Detection

**Question**: How to detect image inputs (local paths and URLs) before request?

**Decision**: Regex pattern matching for common image extensions and URL schemes.

**Findings**:
- Local paths: `/path/to/image.png`, `./relative.jpg`, `~/home/image.gif`
- URLs: `https://...`, `http://...` with image extensions
- Image extensions: `.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`, `.bmp`
- Need to distinguish image paths from regular text paths (like file references)

**Implementation Pattern**:
```typescript
const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp'];
const IMAGE_URL_PATTERN = /^https?:\/\/.+\.(png|jpg|jpeg|gif|webp|bmp)$/i;
const IMAGE_PATH_PATTERN = new RegExp(
  `(?:\\.\\/|\\/|~\\/)[^\\s]+(${IMAGE_EXTENSIONS.join('|')})$`,
  'i'
);

function detectImageInputs(content: string): ImageInput[] {
  const images: ImageInput[] = [];

  // Check for URLs
  const urlMatches = content.matchAll(IMAGE_URL_PATTERN);
  for (const match of urlMatches) {
    images.push({ type: 'url', value: match[0] });
  }

  // Check for local paths
  const pathMatches = content.matchAll(IMAGE_PATH_PATTERN);
  for (const match of pathMatches) {
    images.push({ type: 'path', value: match[0] });
  }

  return images;
}
```

**Anthropic API Image Format** (from docs):
```typescript
// Local file → base64
{
  type: "image",
  source: {
    type: "base64",
    media_type: "image/png",
    data: base64EncodedImage
  }
}

// URL → direct
{
  type: "image",
  source: {
    type: "url",
    url: "https://example.com/image.png"
  }
}
```

**Rationale**: Simple pattern matching sufficient for explicit image inputs. More sophisticated detection (like "describe this screenshot") deferred to model interpretation.

**Alternatives Considered**:
- LLM-based image detection: Rejected - adds latency, simpler patterns sufficient
- File existence check: Rejected - adds I/O, may have false negatives on URLs

---

### 5. Tool Execution Model Switching

**Question**: How to switch to default_model for tool execution and return to calling model?

**Decision**: Pass calling model context to tool executor, which uses default_model internally, then return result to caller.

**Findings**:
- Current tool execution: direct `tool.execute(toolInput)` in loop.ts
- Tool execution is synchronous (await)
- Need wrapper that:
  1. Receives tool call request from any model
  2. Uses default_model to execute (for consistency)
  3. Returns result to calling model

**Implementation Pattern**:
```typescript
interface ToolExecutionContext {
  callingModel: string;
  sessionId: string;
  messages: MessageParam[];
}

async function executeToolWithDefaultModel(
  tool: Tool,
  toolInput: unknown,
  context: ToolExecutionContext,
  client: Anthropic,
  config: ModelConfig
): Promise<string> {
  // Option A: Direct tool execution (no model involved)
  // Tools execute directly, no model needed for tool itself
  // This is simpler and matches current implementation

  const result = await tool.execute(toolInput);

  // Route token check on result
  if (result.startsWith('[REASONING]') ||
      result.startsWith('[FAST]') ||
      result.startsWith('[VISION]')) {
    // Return special marker for route detection
    return { result, hasRouteToken: true, routeToken: detectRouteToken(result) };
  }

  return { result, hasRouteToken: false };
}
```

**Clarification**: Tools in current implementation execute directly without model involvement. `default_model` execution means the *model decision* to call tools and *result interpretation* are model-specific, but tool execution itself is direct function call.

**Refined Approach**: Tool execution is direct (no model switch needed). The "switch to default_model for tools" spec requirement actually means:
1. Any model can trigger tool calls (via tool_use blocks)
2. Tool execution is direct `tool.execute(input)` - no model involved
3. Tool result is returned to calling model for interpretation

This simplifies implementation significantly.

**Rationale**: Tool execution is already model-agnostic. No need to create separate default_model instance for tools.

---

### 6. Config Field Changes

**Question**: How to implement config field changes (model → default_model + optional models)?

**Decision**: Extend ProviderConfig interface, update TOML parsing, add fallback resolution.

**Findings**:
- Current config.ts: `ProviderConfig` with `model: string`
- TOML format: `[provider]` section with `model` field
- Env vars: `CHLOE_MODEL`
- Need to add: `default_model`, `reasoning_model`, `fast_model`, `vision_model`

**Implementation Pattern** (config.ts changes):
```typescript
export interface ProviderConfig {
  apiKey: string;
  name: string;
  defaultModel: string;     // renamed from 'model'
  reasoningModel: string;   // optional, fallback to defaultModel
  fastModel: string;        // optional, fallback to defaultModel
  visionModel: string;      // optional, fallback to defaultModel
  baseUrl: string;
}

// Env vars
const defaultModel = process.env.CHLOE_DEFAULT_MODEL ||
                     str(fileProvider.default_model) ||
                     DEFAULTS.defaultModel;
const reasoningModel = process.env.CHLOE_REASONING_MODEL ||
                       str(fileProvider.reasoning_model) ||
                       defaultModel;  // fallback
const fastModel = process.env.CHLOE_FAST_MODEL ||
                  str(fileProvider.fast_model) ||
                  defaultModel;  // fallback
const visionModel = process.env.CHLOE_VISION_MODEL ||
                    str(fileProvider.vision_model) ||
                    defaultModel;  // fallback
```

**Breaking Change Handling**:
- Old `CHLOE_MODEL` env var → ignored, use `CHLOE_DEFAULT_MODEL`
- Old `model` TOML field → ignored, use `default_model`
- Log warning if old fields detected (optional, helpful for migration)

**Rationale**: Clear field naming, explicit fallback chain, breaking change is documented.

---

### 7. System Prompt for Route Tokens

**Question**: What system prompt enables model to output route tokens?

**Decision**: Add routing instructions to system prompt, instruct model to output route token at response start if needed.

**Findings**:
- Current implementation: no explicit system prompt (user messages only)
- Need to inject routing instructions as system message

**Implementation Pattern**:
```typescript
const ROUTING_SYSTEM_PROMPT = `
You are an AI assistant with routing capabilities.

Before responding to complex requests, output a routing token at the START of your response (on its own line):
- Output "[REASONING]" if this requires deep analysis, multi-step reasoning, or complex problem-solving
- Output "[FAST]" if this is a simple, quick query that needs minimal processing
- Output "[VISION]" if you need to analyze images (though image requests are pre-routed)

Then continue with your actual response.

Examples:
[REASONING]
Let me analyze the architectural trade-offs...

[FAST]
The capital of France is Paris.

(No token for moderate complexity)
Here's a balanced explanation...
`;

function buildMessagesWithRouting(
  userMessage: string,
  images?: ImageInput[]
): MessageParam[] {
  const messages: MessageParam[] = [];

  // Add routing system prompt
  messages.push({
    role: "user",
    content: ROUTING_SYSTEM_PROMPT
  });
  messages.push({
    role: "assistant",
    content: "I understand the routing protocol. I will output routing tokens at line start when appropriate."
  });

  // Add actual user message
  messages.push({
    role: "user",
    content: images ? buildImageContent(userMessage, images) : userMessage
  });

  return messages;
}
```

**Rationale**: System prompt instructs model behavior. Two-shot format (system instruction + assistant acknowledgment) establishes protocol.

**Alternatives Considered**:
- Implicit routing: Rejected - model needs explicit instructions for consistent behavior
- User prompt routing: Rejected - puts burden on user, inconsistent

---

## Consolidated Findings

| Topic | Decision | Key Implementation |
|-------|----------|-------------------|
| Model Selection | Per-call model ID | `client.messages.stream({ model: targetModel })` |
| Route Detection | Line-start buffer | Buffer text, check on newline |
| Model Switching | Abort-restart | Break stream, restart with new model |
| Image Detection | Regex patterns | Match `.png|.jpg|.gif` in paths/URLs |
| Tool Execution | Direct (no model switch) | `tool.execute()` direct call |
| Config Changes | Extended ProviderConfig | Add 4 model fields with fallback |
| System Prompt | Routing instructions | Two-shot prompt format |

---

## Open Items (Resolved)

| Item | Resolution |
|------|------------|
| Tool execution needs default_model? | **No** - tools execute directly, model not involved |
| Route token exact format? | `[REASONING]`, `[FAST]`, `[VISION]` at line start |
| Image URL handling? | Direct URL pass to Anthropic API |
| Local image handling? | Read file, convert to base64 |

---

## Dependencies

- **Anthropic SDK**: Multimodal support for vision_model (image content blocks)
- **Bun fs API**: Read local image files for base64 conversion
- **fetch**: Fetch remote images from URLs (for base64 if API doesn't support direct URL)

**Note**: Anthropic API supports direct URL images since 2024, no need to fetch and convert URLs.