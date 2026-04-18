import Anthropic from "@anthropic-ai/sdk";
import type { MessageParam } from "@anthropic-ai/sdk/resources/messages";
import { getLogger } from "../logger/index.js";
import { createDefaultTools, createSubagentTools, loadToolSettings } from "../tools/index.js";
import { ToolRegistry } from "../tools/registry.js";
import type { Tool, ToolContext } from "../tools/types.js";
import { detectImages, toContentBlocks } from "./image-input.js";
import { runLoop } from "./loop.js";
import { isMultiModel, resolveModelConfig, selectInitialModel } from "./router.js";
import type { AgentCallbacks, AgentConfig, ResolvedModelConfig, RunResult } from "./types.js";

/**
 * System prompt describing subagent tools for model guidance.
 * Only attached when subagent tools are registered (multi-model mode).
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

export class Agent {
  private readonly client: Anthropic;
  private readonly config: AgentConfig;
  private readonly modelConfig: ResolvedModelConfig;
  private readonly registry: ToolRegistry;
  private readonly bashPermissionRef: { current: ((bin: string) => Promise<boolean>) | null };
  private readonly subagentPromptActive: boolean;

  constructor(config: AgentConfig) {
    this.config = config;
    this.client = new Anthropic({ apiKey: config.apiKey, baseURL: config.baseURL });
    this.registry = new ToolRegistry();
    this.bashPermissionRef = { current: null };

    // Use provided modelConfig or create from model string
    this.modelConfig = config.modelConfig ?? resolveModelConfig({ defaultModel: config.model });

    let tools: Tool[];
    if (config.tools !== undefined) {
      tools = config.tools;
    } else {
      tools = createDefaultTools(
        loadToolSettings(process.cwd()),
        process.cwd(),
        this.bashPermissionRef,
      );
    }

    for (const tool of tools) {
      this.registry.register(tool);
    }

    // Register subagent tools only when:
    // 1. Caller did not provide custom tools
    // 2. Resolved config is effectively multi-model
    const multiModel = isMultiModel(this.modelConfig);
    const callerProvidedTools = config.tools !== undefined;
    this.subagentPromptActive = multiModel && !callerProvidedTools;

    if (this.subagentPromptActive) {
      const subagentTools = createSubagentTools(this.client, this.modelConfig, this.registry);
      for (const tool of subagentTools) {
        this.registry.register(tool);
      }
    }
  }

  async run(
    sessionId: string,
    userMessage: string,
    callbacks: AgentCallbacks = {},
  ): Promise<RunResult> {
    const { storage } = this.config;
    const log = getLogger("agent");
    const startMs = Date.now();

    // Detect images in user message
    const detectedImages = detectImages(userMessage);
    const imageBlocks = await toContentBlocks(detectedImages);
    const hasImages = imageBlocks.length > 0;

    // Select initial model based on image detection
    const initialModel = selectInitialModel(hasImages, this.modelConfig);

    log.info("run started", { session: sessionId, model: initialModel, hasImages });

    this.bashPermissionRef.current = callbacks.confirmBashCommand ?? null;
    try {
      // Ensure session exists
      let session = await storage.getSession(sessionId);
      if (session === null) {
        session = await storage.createSession(sessionId, sessionId);
      }

      // Load history and append new user message
      const history = await storage.getMessages(sessionId);
      const messages: MessageParam[] = history.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content as MessageParam["content"],
      }));

      // Build user message content: text + image blocks if present
      const userContent: MessageParam["content"] = hasImages
        ? [{ type: "text", text: userMessage }, ...imageBlocks]
        : userMessage;

      messages.push({ role: "user", content: userContent });

      // Run the ReAct loop with optional system prompt for subagent tools
      const toolContext: ToolContext = {
        sessionId,
        storage,
        client: this.client,
        modelConfig: this.modelConfig,
      };

      const result = await runLoop({
        messages,
        client: this.client,
        model: initialModel,
        tools: this.registry,
        callbacks,
        toolContext,
        ...(this.subagentPromptActive ? { system: SUBAGENT_SYSTEM_PROMPT } : {}),
      });

      // Persist the new messages (user + assistant turns added by the loop)
      const newMessages = result.messages.slice(messages.length - 1);
      for (const msg of newMessages) {
        const role = msg.role === "user" ? "user" : "assistant";
        await storage.appendMessage(sessionId, role, msg.content);
      }

      await storage.touchSession(sessionId);

      log.info("run completed", { session: sessionId, elapsed_ms: Date.now() - startMs });
      return result;
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      log.error("run failed", { session: sessionId, error });
      throw err;
    } finally {
      this.bashPermissionRef.current = null;
    }
  }
}

export function createAgent(config: AgentConfig): Agent {
  return new Agent(config);
}
