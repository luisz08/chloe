import Anthropic from "@anthropic-ai/sdk";
import type { MessageParam } from "@anthropic-ai/sdk/resources/messages";
import { ToolRegistry } from "../tools/registry.js";
import { runLoop } from "./loop.js";
import type { AgentCallbacks, AgentConfig, RunResult } from "./types.js";

export class Agent {
  private readonly client: Anthropic;
  private readonly config: AgentConfig;
  private readonly registry: ToolRegistry;

  constructor(config: AgentConfig) {
    this.config = config;
    this.client = new Anthropic({ apiKey: config.apiKey });
    this.registry = new ToolRegistry();
    for (const tool of config.tools) {
      this.registry.register(tool);
    }
  }

  async run(
    sessionId: string,
    userMessage: string,
    callbacks: AgentCallbacks = {},
  ): Promise<RunResult> {
    const { storage, model } = this.config;

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

    messages.push({ role: "user", content: userMessage });

    // Run the ReAct loop
    const result = await runLoop({
      messages,
      client: this.client,
      model,
      tools: this.registry,
      callbacks,
    });

    // Persist the new messages (user + assistant turns added by the loop)
    const newMessages = result.messages.slice(messages.length - 1);
    for (const msg of newMessages) {
      const role = msg.role === "user" ? "user" : "assistant";
      await storage.appendMessage(sessionId, role, msg.content);
    }

    await storage.touchSession(sessionId);

    return result;
  }
}

export function createAgent(config: AgentConfig): Agent {
  return new Agent(config);
}
