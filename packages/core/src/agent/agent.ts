import Anthropic from "@anthropic-ai/sdk";
import type { MessageParam } from "@anthropic-ai/sdk/resources/messages";
import { getLogger } from "../logger/index.js";
import { createDefaultTools, loadToolSettings } from "../tools/index.js";
import { ToolRegistry } from "../tools/registry.js";
import { detectImages, toContentBlocks } from "./image-input.js";
import { routingRunLoop } from "./loop.js";
import { resolveModelConfig, selectInitialModel } from "./router.js";
import type { AgentCallbacks, AgentConfig, ResolvedModelConfig, RunResult } from "./types.js";

export class Agent {
  private readonly client: Anthropic;
  private readonly config: AgentConfig;
  private readonly modelConfig: ResolvedModelConfig;
  private readonly registry: ToolRegistry;
  private readonly bashPermissionRef: { current: ((bin: string) => Promise<boolean>) | null };

  constructor(config: AgentConfig) {
    this.config = config;
    this.client = new Anthropic({ apiKey: config.apiKey, baseURL: config.baseURL });
    this.registry = new ToolRegistry();
    this.bashPermissionRef = { current: null };

    // Create model config from the model string (all models use same default)
    this.modelConfig = resolveModelConfig({ defaultModel: config.model });

    const tools =
      config.tools !== undefined
        ? config.tools
        : createDefaultTools(
            loadToolSettings(process.cwd()),
            process.cwd(),
            this.bashPermissionRef,
          );
    for (const tool of tools) {
      this.registry.register(tool);
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

      // Run the routing-aware ReAct loop
      const result = await routingRunLoop({
        messages,
        client: this.client,
        model: initialModel,
        tools: this.registry,
        callbacks,
        modelConfig: this.modelConfig,
        hasImages,
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
