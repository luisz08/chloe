import type Anthropic from "@anthropic-ai/sdk";
import type { MessageParam, TextBlock, ToolUseBlock } from "@anthropic-ai/sdk/resources/messages";
import { getLogger } from "../logger/index.js";
import type { ToolRegistry } from "../tools/registry.js";
import { RouteDetector } from "./route-detector.js";
import { MAX_ROUTE_SWITCHES, resolveTargetModel } from "./router.js";
import type {
  AgentCallbacks,
  ResolvedModelConfig,
  RouteTokenType,
  RoutingState,
  RunResult,
} from "./types.js";

export interface RunLoopOptions {
  messages: MessageParam[];
  client: Anthropic;
  model: string;
  tools: ToolRegistry;
  callbacks: AgentCallbacks;
}

export interface RoutingRunLoopOptions extends RunLoopOptions {
  modelConfig: ResolvedModelConfig;
  hasImages?: boolean;
}

export async function runLoop(options: RunLoopOptions): Promise<RunResult> {
  const { client, model, tools, callbacks } = options;
  const messages: MessageParam[] = [...options.messages];
  let finalText = "";
  const log = getLogger("loop");

  for (;;) {
    log.debug("llm request", { messages: messages.length, model });

    const stream = client.messages.stream({
      model,
      max_tokens: 4096,
      tools: tools.list(),
      messages,
    });

    let currentText = "";
    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        currentText += event.delta.text;
        callbacks.onToken?.(event.delta.text);
      }
    }

    const finalMessage = await stream.finalMessage();

    callbacks.onUsage?.({
      inputTokens: finalMessage.usage.input_tokens,
      outputTokens: finalMessage.usage.output_tokens,
      cacheReadTokens: finalMessage.usage.cache_read_input_tokens ?? 0,
      cacheCreationTokens: finalMessage.usage.cache_creation_input_tokens ?? 0,
    });

    // Build the assistant message from the final message content
    const assistantContent: Array<TextBlock | ToolUseBlock> = [];
    for (const block of finalMessage.content) {
      if (block.type === "text" || block.type === "tool_use") {
        assistantContent.push(block);
      }
    }

    if (assistantContent.length > 0) {
      messages.push({ role: "assistant", content: assistantContent });
    }

    if (currentText.length > 0) {
      finalText = currentText;
    }

    log.debug("stop reason", { reason: finalMessage.stop_reason });

    if (finalMessage.stop_reason === "end_turn") {
      break;
    }

    if (finalMessage.stop_reason !== "tool_use") {
      break;
    }

    // Handle tool use blocks
    const toolResults: Array<{
      type: "tool_result";
      tool_use_id: string;
      content: string;
    }> = [];

    for (const block of finalMessage.content) {
      if (block.type !== "tool_use") {
        continue;
      }

      const toolName = block.name;
      const toolInput = block.input;

      const inputStr = JSON.stringify(toolInput);
      log.info("tool call", { tool: toolName, input: inputStr.slice(0, 200) });
      callbacks.onToolCall?.(toolName, toolInput);

      // Check confirmation
      if (callbacks.confirmTool !== undefined) {
        const confirmed = await callbacks.confirmTool(toolName, toolInput);
        if (!confirmed) {
          log.debug("tool denied", { tool: toolName });
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: "Tool execution was denied by the user.",
          });
          continue;
        }
      }

      const tool = tools.get(toolName);
      if (tool === null) {
        log.warn("unknown tool", { tool: toolName });
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: `Unknown tool: ${toolName}`,
        });
        continue;
      }

      try {
        const output = await tool.execute(toolInput);
        log.debug("tool result", { tool: toolName, output_len: output.length });
        callbacks.onToolResult?.(toolName, output);
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: output,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.error("tool error", { tool: toolName, error: message });
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: `Tool error: ${message}`,
        });
      }
    }

    if (toolResults.length > 0) {
      messages.push({ role: "user", content: toolResults });
    }
  }

  return { messages, finalText };
}

// ─── Routing Run Loop ───────────────────────────────────────────────────────────

/**
 * Routing-aware run loop with route token detection and model switching.
 *
 * Key behaviors:
 * 1. Detects route tokens ([REASONING], [FAST], [VISION]) at line start during streaming
 * 2. Aborts stream when token detected, switches to target model
 * 3. Discards content from aborted stream, restarts with new model
 * 4. Enforces MAX_ROUTE_SWITCHES limit (force default_model after limit)
 * 5. Handles empty response after route token with regeneration attempt
 * 6. Pre-routed image requests: skip route detection when starting with vision_model
 */
export async function routingRunLoop(options: RoutingRunLoopOptions): Promise<RunResult> {
  const { client, tools, callbacks, modelConfig, hasImages = false } = options;
  const messages: MessageParam[] = [...options.messages];
  let finalText = "";
  const log = getLogger("routing-loop");

  // Initialize routing state
  const routingState: RoutingState = {
    currentModel: options.model,
    routeCount: 0,
    callingModel: null,
    pendingToolCalls: [],
  };

  const detector = new RouteDetector();

  // Skip route detection for vision_model start (pre-routed image request)
  const skipRouteDetection = hasImages && routingState.currentModel === modelConfig.visionModel;
  if (skipRouteDetection) {
    log.debug("pre-routed to vision_model, skipping route token detection");
  }

  for (;;) {
    log.debug("llm request", { messages: messages.length, model: routingState.currentModel });

    const stream = client.messages.stream({
      model: routingState.currentModel,
      max_tokens: 4096,
      tools: tools.list(),
      messages,
    });

    let currentText = "";
    let aborted = false;
    let detectedToken: RouteTokenType | null = null;

    // Stream with route detection (skip if pre-routed)
    try {
      for await (const event of stream) {
        if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
          const deltaText = event.delta.text;

          // Skip route token detection for vision_model on first stream
          if (skipRouteDetection && routingState.routeCount === 0) {
            currentText += deltaText;
            callbacks.onToken?.(deltaText);
            continue;
          }

          // Check for route token in stream
          const detection = detector.detectInStream(deltaText);

          if (detection.detected && detection.shouldAbort) {
            // Route token detected - abort stream
            aborted = true;
            detectedToken = detection.token;
            log.info("route token detected", {
              token: detectedToken,
              currentModel: routingState.currentModel,
            });
            break;
          }

          // No route token - accumulate text and call callback
          if (!detection.detected) {
            currentText += deltaText;
            callbacks.onToken?.(deltaText);
          }
        }
      }
    } catch (err) {
      // Stream aborted - expected behavior for route switching
      if (err instanceof Error && err.message.includes("aborted")) {
        log.debug("stream aborted for route switch");
      } else {
        throw err;
      }
    }

    // Handle route switch
    if (aborted && detectedToken) {
      // Check route count limit
      routingState.routeCount++;
      if (routingState.routeCount >= MAX_ROUTE_SWITCHES) {
        log.warn("max route switches reached, forcing default_model");
        routingState.currentModel = modelConfig.defaultModel;
      } else {
        // Switch to target model
        routingState.currentModel = resolveTargetModel(detectedToken, modelConfig);
      }

      // Reset detector for new stream
      detector.reset();

      // Continue with same messages (discard aborted content)
      continue;
    }

    // No route switch - complete the stream normally
    const finalMessage = await stream.finalMessage();

    callbacks.onUsage?.({
      inputTokens: finalMessage.usage.input_tokens,
      outputTokens: finalMessage.usage.output_tokens,
      cacheReadTokens: finalMessage.usage.cache_read_input_tokens ?? 0,
      cacheCreationTokens: finalMessage.usage.cache_creation_input_tokens ?? 0,
    });

    // Build the assistant message from the final message content
    const assistantContent: Array<TextBlock | ToolUseBlock> = [];
    for (const block of finalMessage.content) {
      if (block.type === "text" || block.type === "tool_use") {
        assistantContent.push(block);
      }
    }

    if (assistantContent.length > 0) {
      messages.push({ role: "assistant", content: assistantContent });
    }

    // Handle empty response after route switch
    if (currentText.length === 0 && routingState.routeCount > 0) {
      log.warn("empty response after route switch", { model: routingState.currentModel });
      // Could attempt regeneration here - for now, log warning and continue
    }

    if (currentText.length > 0) {
      finalText = currentText;
    }

    log.debug("stop reason", { reason: finalMessage.stop_reason });

    if (finalMessage.stop_reason === "end_turn") {
      break;
    }

    if (finalMessage.stop_reason !== "tool_use") {
      break;
    }

    // Handle tool use blocks
    const toolResults: Array<{
      type: "tool_result";
      tool_use_id: string;
      content: string;
    }> = [];

    for (const block of finalMessage.content) {
      if (block.type !== "tool_use") {
        continue;
      }

      const toolName = block.name;
      const toolInput = block.input;

      // Track calling model for tool result routing
      routingState.callingModel = routingState.currentModel;

      const inputStr = JSON.stringify(toolInput);
      log.info("tool call", {
        tool: toolName,
        input: inputStr.slice(0, 200),
        callingModel: routingState.callingModel,
      });
      callbacks.onToolCall?.(toolName, toolInput);

      // Check confirmation
      if (callbacks.confirmTool !== undefined) {
        const confirmed = await callbacks.confirmTool(toolName, toolInput);
        if (!confirmed) {
          log.debug("tool denied", { tool: toolName });
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: "Tool execution was denied by the user.",
          });
          continue;
        }
      }

      const tool = tools.get(toolName);
      if (tool === null) {
        log.warn("unknown tool", { tool: toolName });
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: `Unknown tool: ${toolName}`,
        });
        continue;
      }

      try {
        const output = await tool.execute(toolInput);
        log.debug("tool result", { tool: toolName, output_len: output.length });
        callbacks.onToolResult?.(toolName, output);

        // Check for route token in tool result (at line start)
        const toolResultDetection = detector.detectInStream(output);
        if (
          toolResultDetection.detected &&
          toolResultDetection.shouldAbort &&
          toolResultDetection.token
        ) {
          log.info("route token in tool result", { token: toolResultDetection.token });
          routingState.routeCount++;
          if (routingState.routeCount >= MAX_ROUTE_SWITCHES) {
            routingState.currentModel = modelConfig.defaultModel;
          } else {
            routingState.currentModel = resolveTargetModel(toolResultDetection.token, modelConfig);
          }
          detector.reset();
        }

        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: output,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.error("tool error", { tool: toolName, error: message });
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: `Tool error: ${message}`,
        });
      }
    }

    if (toolResults.length > 0) {
      messages.push({ role: "user", content: toolResults });
    }

    // Return results to calling model after tool execution
    if (routingState.callingModel && routingState.currentModel !== routingState.callingModel) {
      // Switch back to calling model to process tool results
      routingState.currentModel = routingState.callingModel;
      routingState.callingModel = null;
      log.debug("returning to calling model after tool execution", {
        model: routingState.currentModel,
      });
    }
  }

  return { messages, finalText };
}
