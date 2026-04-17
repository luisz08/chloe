import type Anthropic from "@anthropic-ai/sdk";
import type { MessageParam, TextBlock, ToolUseBlock } from "@anthropic-ai/sdk/resources/messages";
import { getLogger } from "../logger/index.js";
import type { ToolRegistry } from "../tools/registry.js";
import type { AgentCallbacks, ResolvedModelConfig, RoutingState, RunResult } from "./types.js";

/**
 * System prompt describing subagent tools for model guidance.
 */
const SUBAGENT_SYSTEM_PROMPT = `
You have access to specialized subagent tools for delegating work to other models:

- vision_analyze: Use when you need to understand image content (photos, screenshots, diagrams).
  Provide an image path or URL and describe what you want to analyze.
  Examples: "Describe this screenshot", "What text is in this image?", "Explain the diagram in this file".

- fast_query: Use for simple, quick questions that need minimal processing.
  Faster but less detailed responses. Good for quick lookups, simple calculations, or brief explanations.

- deep_reasoning: Use for complex analysis, multi-step reasoning, or difficult problems.
  More thorough but slower. Good for architectural decisions, complex debugging, or detailed analysis.

When you encounter a task that matches these patterns, use the appropriate subagent tool instead of trying to do everything yourself. This helps you work more efficiently and leverage specialized capabilities.
`;

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
        // Set callingTool for recursion prevention
        tools.setCallingTool(toolName);
        const output = await tool.execute(toolInput);
        tools.setCallingTool(null);
        log.debug("tool result", { tool: toolName, output_len: output.length });
        callbacks.onToolResult?.(toolName, output);
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: output,
        });
      } catch (err) {
        tools.setCallingTool(null);
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
 * Routing-aware run loop with subagent tool support.
 *
 * Key behaviors:
 * 1. Uses vision_model for image-containing requests (pre-routing)
 * 2. Provides subagent tools for model delegation
 * 3. Single model execution per request (no mid-stream switching)
 */
export async function routingRunLoop(options: RoutingRunLoopOptions): Promise<RunResult> {
  const { client, tools, callbacks } = options;
  const messages: MessageParam[] = [...options.messages];
  let finalText = "";
  const log = getLogger("routing-loop");

  // Initialize routing state
  const routingState: RoutingState = {
    currentModel: options.model,
    callingTool: null,
  };

  for (;;) {
    log.debug("llm request", { messages: messages.length, model: routingState.currentModel });

    const stream = client.messages.stream({
      model: routingState.currentModel,
      max_tokens: 4096,
      system: SUBAGENT_SYSTEM_PROMPT,
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
      log.info("tool call", {
        tool: toolName,
        input: inputStr.slice(0, 200),
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
        // Set callingTool for recursion prevention
        tools.setCallingTool(toolName);
        const output = await tool.execute(toolInput);
        tools.setCallingTool(null);
        log.debug("tool result", { tool: toolName, output_len: output.length });
        callbacks.onToolResult?.(toolName, output);

        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: output,
        });
      } catch (err) {
        tools.setCallingTool(null);
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
