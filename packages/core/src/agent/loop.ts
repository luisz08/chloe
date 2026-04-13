import type Anthropic from "@anthropic-ai/sdk";
import type { MessageParam, TextBlock, ToolUseBlock } from "@anthropic-ai/sdk/resources/messages";
import type { ToolRegistry } from "../tools/registry.js";
import type { AgentCallbacks, RunResult } from "./types.js";

export interface RunLoopOptions {
  messages: MessageParam[];
  client: Anthropic;
  model: string;
  tools: ToolRegistry;
  callbacks: AgentCallbacks;
}

export async function runLoop(options: RunLoopOptions): Promise<RunResult> {
  const { client, model, tools, callbacks } = options;
  const messages: MessageParam[] = [...options.messages];
  let finalText = "";

  for (;;) {
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

      callbacks.onToolCall?.(toolName, toolInput);

      // Check confirmation
      if (callbacks.confirmTool !== undefined) {
        const confirmed = await callbacks.confirmTool(toolName, toolInput);
        if (!confirmed) {
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
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: `Unknown tool: ${toolName}`,
        });
        continue;
      }

      try {
        const output = await tool.execute(toolInput);
        callbacks.onToolResult?.(toolName, output);
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: output,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
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
