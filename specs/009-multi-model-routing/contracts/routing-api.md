# Contract: Routing API (Internal)

**Feature**: 009-multi-model-routing
**Type**: Internal API Contract
**Date**: 2026-04-16

## Module: `@chloe/core/agent/router`

### ModelRouter

```typescript
interface ModelRouter {
  /**
   * Resolve model configuration with fallback logic.
   */
  resolveModelConfig(config: Partial<ModelConfigInput>): ResolvedModelConfig;

  /**
   * Select initial model for request based on content analysis.
   * Returns defaultModel for text-only, visionModel for image input.
   */
  selectInitialModel(content: string, images: ImageInput[]): string;

  /**
   * Resolve target model from route token.
   * Returns fallback to defaultModel if target not configured.
   */
  resolveTargetModel(token: RouteTokenType, config: ResolvedModelConfig): string;
}

interface ModelConfigInput {
  defaultModel?: string;
  reasoningModel?: string;
  fastModel?: string;
  visionModel?: string;
}

interface ResolvedModelConfig {
  defaultModel: string;      // Always resolved
  reasoningModel: string;    // Fallback applied
  fastModel: string;         // Fallback applied
  visionModel: string;       // Fallback applied
}

type RouteTokenType = "REASONING" | "FAST" | "VISION";
```

---

### RouteDetector

```typescript
interface RouteDetector {
  /**
   * Process streaming text and detect route tokens at line start.
   * Returns detected token or null.
   */
  detectInStream(textDelta: string, state: DetectionState): RouteDetectionResult;

  /**
   * Check if text content starts with route token.
   * Used for tool result checking.
   */
  checkLineStart(text: string): RouteTokenType | null;

  /**
   * Reset detection state for new generation.
   */
  reset(): void;
}

interface DetectionState {
  buffer: string;      // Accumulated text since last newline
  lineStart: boolean;  // Is current position at line start?
  detected: boolean;   // Has route token been detected this turn?
}

interface RouteDetectionResult {
  detected: boolean;
  token: RouteTokenType | null;
  shouldAbort: boolean;  // True if route token found, should abort stream
  remainingText: string; // Text after route token (to discard)
}
```

---

### RoutingRunLoop

```typescript
interface RoutingRunLoopOptions {
  messages: MessageParam[];
  client: Anthropic;
  config: ResolvedModelConfig;
  tools: ToolRegistry;
  callbacks: AgentCallbacks;
  images?: ImageInput[];
}

interface RoutingResult extends RunResult {
  modelUsed: string;        // Final model that generated response
  routeSwitches: number;    // Count of route switches during request
}

/**
 * Enhanced runLoop with routing capability.
 * Handles route token detection, model switching, tool execution.
 */
async function routingRunLoop(options: RoutingRunLoopOptions): Promise<RoutingResult>;
```

---

### ToolExecutor

```typescript
interface ToolExecutor {
  /**
   * Execute tool and return result.
   * Checks result for route tokens.
   */
  execute(
    tool: Tool,
    input: unknown,
    callingModel: string
  ): Promise<ToolExecutionResult>;
}

interface ToolExecutionResult {
  output: string;
  hasRouteToken: boolean;
  routeToken: RouteTokenType | null;
}
```

---

### ImageInputProcessor

```typescript
interface ImageInputProcessor {
  /**
   * Detect image inputs from message content.
   * Returns array of detected images (paths and URLs).
   */
  detect(content: string): ImageInput[];

  /**
   * Convert detected images to Anthropic content blocks.
   * Handles local paths (base64) and URLs (direct).
   */
  toContentBlocks(images: ImageInput[]): Promise<ImageContentBlock[]>;
}

interface ImageInput {
  type: "path" | "url";
  value: string;
  mediaType?: string;  // png, jpg, gif, webp, bmp
}

interface ImageContentBlock {
  type: "image";
  source: {
    type: "base64" | "url";
    media_type?: string;
    data?: string;     // for base64
    url?: string;      // for url
  };
}
```

---

## Constants

```typescript
const ROUTE_TOKENS = {
  REASONING: "[REASONING]",
  FAST: "[FAST]",
  VISION: "[VISION]",
} as const;

const MAX_ROUTE_SWITCHES = 5;

const SUPPORTED_IMAGE_EXTENSIONS = [
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp"
];

const DEFAULT_MODEL = "claude-sonnet-4-6";
```

---

## Error Types

```typescript
class RouteLimitExceededError extends Error {
  constructor(switchCount: number) {
    super(`Route switch limit (${MAX_ROUTE_SWITCHES}) exceeded`);
  }
}

class ImageNotFoundError extends Error {
  constructor(path: string) {
    super(`Image file not found: ${path}`);
  }
}

class ImageFetchError extends Error {
  constructor(url: string, reason: string) {
    super(`Failed to fetch image from URL: ${url} - ${reason}`);
  }
}
```

---

## Callbacks Extensions

```typescript
interface RoutingCallbacks extends AgentCallbacks {
  /**
   * Called when route token detected and model switch occurs.
   */
  onRouteSwitch?: (
    fromModel: string,
    toModel: string,
    token: RouteTokenType
  ) => void;

  /**
   * Called when route limit reached.
   */
  onRouteLimitReached?: (switchCount: number) => void;
}
```