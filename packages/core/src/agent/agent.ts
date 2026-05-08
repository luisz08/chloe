import Anthropic from "@anthropic-ai/sdk";
import type { MessageParam } from "@anthropic-ai/sdk/resources/messages";
import { buildSummarySystem, stripLegacyXmlWrapper } from "../context/summaryBlock.js";
import { getLogger } from "../logger/index.js";
import { HookRegistry } from "../plugins/hooks.js";
import { loadInstalledPlugins } from "../plugins/loader.js";
import { HookEvent } from "../plugins/types.js";
import { ContentBlockType } from "../providers/anthropic.js";
import { MessageRole } from "../session/types.js";
import { createDefaultTools, createSubagentTools, loadToolSettings } from "../tools/index.js";
import { ToolRegistry } from "../tools/registry.js";
import type { Tool, ToolContext } from "../tools/types.js";
import { compressIfNeeded } from "./compressor.js";
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
  readonly hookRegistry: HookRegistry;
  private pluginInitPromise: Promise<void> | null = null;

  constructor(config: AgentConfig) {
    this.config = config;
    this.client = new Anthropic({ apiKey: config.apiKey, baseURL: config.baseURL });
    this.registry = new ToolRegistry();
    this.bashPermissionRef = { current: null };
    this.hookRegistry = new HookRegistry();

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
        config.search,
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
    skillSystem?: string,
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
      if (!this.pluginInitPromise) {
        this.pluginInitPromise = loadInstalledPlugins().then((plugins) => {
          this.hookRegistry.registerAll(plugins.flatMap((p) => p.hooks));
        });
      }
      await this.pluginInitPromise;

      // Ensure session exists
      let session = await storage.getSession(sessionId);
      void this.hookRegistry.fire(HookEvent.SessionStart, {
        event: HookEvent.SessionStart,
        sessionId,
        pluginRoot: "",
      });
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
        ? [{ type: ContentBlockType.Text, text: userMessage }, ...imageBlocks]
        : userMessage;

      messages.push({ role: "user", content: userContent });

      // Load existing compression summary and inject into system prompt (not messages)
      const existingSummary = await storage.getSessionSummary(sessionId);
      const summarySystemPart =
        existingSummary !== null ? stripLegacyXmlWrapper(existingSummary) : null;

      const buildSystem = (summaryPart: string | null, paths: string[]): string | undefined => {
        const parts = [
          summaryPart !== null ? buildSummarySystem(summaryPart, paths) : null,
          this.subagentPromptActive ? SUBAGENT_SYSTEM_PROMPT : null,
          skillSystem ?? null,
        ].filter(Boolean);
        return parts.length > 0 ? parts.join("\n\n---\n\n") : undefined;
      };

      let system = buildSystem(summarySystemPart, []);

      // Compress if token count exceeds threshold (T012)
      const compressResult = await compressIfNeeded(messages, {
        client: this.client,
        model: initialModel,
        fastModel: this.modelConfig.fastModel,
        ...(system !== undefined ? { system } : {}),
        threshold: this.config.contextCompression?.threshold ?? 0.75,
        keepRecentCount: this.config.contextCompression?.keepRecentCount ?? 20,
        ...(existingSummary !== null ? { existingSummary } : {}),
      });

      if (compressResult !== null) {
        // Store the full structured system block so subsequent loads can inject it directly
        const newSummaryBlock = buildSummarySystem(
          compressResult.summaryText,
          compressResult.workingSetPaths,
        );
        await storage.setSessionSummary(sessionId, newSummaryBlock);

        // Record the oldest kept DB message's timestamp so subsequent loads skip the archived messages.
        // keptCount includes the new_user message (not yet in DB), so DB-kept count = keptCount - 1.
        const dbKeptCount = Math.min(compressResult.keptCount - 1, history.length);
        const cutoffMsg = history[history.length - dbKeptCount] ?? history[0];
        if (cutoffMsg !== undefined) {
          await storage.setCompressionKeptFrom(sessionId, cutoffMsg.createdAt);
        }

        messages.length = 0;
        messages.push(...compressResult.messages);
        system = buildSystem(compressResult.summaryText, compressResult.workingSetPaths);
        callbacks.onContextCompressed?.({
          compressedCount: compressResult.compressedCount,
          keptCount: compressResult.keptCount,
        });
      }

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
        hookRegistry: this.hookRegistry,
        ...(system !== undefined ? { system } : {}),
      });

      // Persist the new messages (user + assistant turns added by the loop)
      const newMessages = result.messages.slice(messages.length - 1);
      for (const msg of newMessages) {
        const role = msg.role === MessageRole.User ? MessageRole.User : MessageRole.Assistant;
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
      void this.hookRegistry.fire(HookEvent.SessionEnd, {
        event: HookEvent.SessionEnd,
        sessionId,
        pluginRoot: "",
      });
      this.bashPermissionRef.current = null;
    }
  }

  async forceCompress(
    sessionId: string,
    callbacks: Pick<AgentCallbacks, "onContextCompressed"> = {},
  ): Promise<void> {
    const { storage } = this.config;
    const history = await storage.getMessages(sessionId);
    if (history.length === 0) return;

    const existingSummary = await storage.getSessionSummary(sessionId);
    const messages: MessageParam[] = history.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content as MessageParam["content"],
    }));

    const result = await compressIfNeeded(messages, {
      client: this.client,
      model: this.modelConfig.defaultModel,
      fastModel: this.modelConfig.fastModel,
      ...(this.subagentPromptActive ? { system: SUBAGENT_SYSTEM_PROMPT } : {}),
      threshold: 0,
      keepRecentCount: this.config.contextCompression?.keepRecentCount ?? 20,
      ...(existingSummary !== null ? { existingSummary } : {}),
    });

    if (result !== null) {
      const newSummaryBlock = buildSummarySystem(result.summaryText, result.workingSetPaths);
      await storage.setSessionSummary(sessionId, newSummaryBlock);
      callbacks.onContextCompressed?.({
        compressedCount: result.compressedCount,
        keptCount: result.keptCount,
      });
    }
  }
}

export function createAgent(config: AgentConfig): Agent {
  return new Agent(config);
}
