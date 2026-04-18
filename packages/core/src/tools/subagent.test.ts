import { beforeEach, describe, expect, it } from "bun:test";
import type Anthropic from "@anthropic-ai/sdk";
import type { Message } from "@anthropic-ai/sdk/resources/messages";
import type { ResolvedModelConfig } from "../agent/types.js";
import { SQLiteStorageAdapter } from "../storage/sqlite.js";
import { ToolRegistry } from "./registry.js";
import {
  createDeepReasoningTool,
  createFastQueryTool,
  createSubagentTools,
  createVisionAnalyzeTool,
} from "./subagent.js";
import type { Tool, ToolContext } from "./types.js";

// Mock Anthropic client - simple approach
interface MockClient {
  client: Anthropic;
  calls: Array<Anthropic.Messages.MessageCreateParams>;
}

function createMockClient(): MockClient {
  const calls: Array<Anthropic.Messages.MessageCreateParams> = [];

  const createFn = async (params: Anthropic.Messages.MessageCreateParams): Promise<Message> => {
    calls.push(params);
    return {
      id: "mock-msg-id",
      type: "message",
      role: "assistant",
      content: [{ type: "text", text: `Mock response for ${params.model}`, citations: [] }],
      model: params.model,
      stop_reason: "end_turn",
      stop_sequence: null,
      usage: {
        input_tokens: 100,
        output_tokens: 50,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
      },
    };
  };

  const client = {
    messages: {
      create: createFn,
    },
  } as unknown as Anthropic;

  return { client, calls };
}

// Mock model config
const mockModelConfig: ResolvedModelConfig = {
  defaultModel: "claude-sonnet-4-6",
  reasoningModel: "claude-opus-4-7",
  fastModel: "claude-haiku-4-5",
  visionModel: "claude-sonnet-4-6",
};

// ─── Vision Analyze Tool Tests ───────────────────────────────────────────────────

describe("createVisionAnalyzeTool", () => {
  let mockClientResult: MockClient;
  let registry: ToolRegistry;
  let tool: Tool;

  beforeEach(() => {
    mockClientResult = createMockClient();
    registry = new ToolRegistry();
    tool = createVisionAnalyzeTool(mockClientResult.client, mockModelConfig, registry);
  });

  it("should create tool with correct name and description", () => {
    expect(tool.name).toBe("vision_analyze");
    expect(tool.description).toContain("vision-capable model");
  });

  it("should have correct input schema", () => {
    expect(tool.inputSchema.type).toBe("object");
    expect(tool.inputSchema.properties.prompt).toBeDefined();
    expect(tool.inputSchema.properties.path).toBeDefined();
    expect(tool.inputSchema.properties.url).toBeDefined();
    expect(tool.inputSchema.required).toContain("prompt");
  });

  it("should return error when called recursively", async () => {
    registry.setCallingTool("vision_analyze");
    const result = await tool.execute({ prompt: "test", url: "https://example.com/image.png" });
    expect(result).toContain("Error");
    expect(result).toContain("recursively");
  });

  it("should return error when no image provided", async () => {
    const result = await tool.execute({ prompt: "Describe this" });
    expect(result).toContain("Error");
    expect(result).toContain("No image provided");
  });

  it("should call vision model with URL image", async () => {
    registry.setCallingTool(null);
    const result = await tool.execute({
      url: "https://example.com/image.png",
      prompt: "What is in this image?",
    });
    expect(result).toContain("Mock response");
    expect(mockClientResult.calls.length).toBe(1);
    expect(mockClientResult.calls[0]?.model).toBe(mockModelConfig.visionModel);
  });

  it("should clear callingTool after successful execution", async () => {
    registry.setCallingTool(null);
    await tool.execute({
      url: "https://example.com/image.png",
      prompt: "What is in this image?",
    });
    // After execution, callingTool should be cleared
    expect(registry.getCallingTool()).toBeNull();
  });

  it("should clear callingTool after error", async () => {
    // Create mock client that throws
    const errorClient = {
      messages: {
        create: async (): Promise<Message> => {
          throw new Error("API error");
        },
      },
    } as unknown as Anthropic;

    const errorTool = createVisionAnalyzeTool(errorClient, mockModelConfig, registry);
    registry.setCallingTool(null);

    await errorTool.execute({
      url: "https://example.com/image.png",
      prompt: "What is in this image?",
    });
    // After error, callingTool should be cleared
    expect(registry.getCallingTool()).toBeNull();
  });

  it("should allow sequential calls after clearing callingTool", async () => {
    registry.setCallingTool(null);

    // First call
    const result1 = await tool.execute({
      url: "https://example.com/image.png",
      prompt: "First image",
    });
    expect(result1).toContain("Mock response");
    expect(registry.getCallingTool()).toBeNull();

    // Second call should work (callingTool was cleared)
    const result2 = await tool.execute({
      url: "https://example.com/image2.png",
      prompt: "Second image",
    });
    expect(result2).toContain("Mock response");
    expect(mockClientResult.calls.length).toBe(2);
  });
});

// ─── Fast Query Tool Tests ───────────────────────────────────────────────────────

describe("createFastQueryTool", () => {
  let mockClientResult: MockClient;
  let registry: ToolRegistry;
  let tool: Tool;

  beforeEach(() => {
    mockClientResult = createMockClient();
    registry = new ToolRegistry();
    tool = createFastQueryTool(mockClientResult.client, mockModelConfig, registry);
  });

  it("should create tool with correct name and description", () => {
    expect(tool.name).toBe("fast_query");
    expect(tool.description).toContain("fast model");
  });

  it("should have correct input schema", () => {
    expect(tool.inputSchema.type).toBe("object");
    expect(tool.inputSchema.properties.query).toBeDefined();
    expect(tool.inputSchema.required).toContain("query");
  });

  it("should return error when called recursively", async () => {
    registry.setCallingTool("fast_query");
    const result = await tool.execute({ query: "test query" });
    expect(result).toContain("Error");
    expect(result).toContain("recursively");
  });

  it("should call fast model with query", async () => {
    registry.setCallingTool(null);
    const result = await tool.execute({ query: "What is the capital of France?" });
    expect(result).toContain("Mock response");
    expect(mockClientResult.calls.length).toBe(1);
    expect(mockClientResult.calls[0]?.model).toBe(mockModelConfig.fastModel);
  });

  it("should clear callingTool after successful execution", async () => {
    registry.setCallingTool(null);
    await tool.execute({ query: "Test query" });
    expect(registry.getCallingTool()).toBeNull();
  });

  it("should allow sequential calls after clearing callingTool", async () => {
    registry.setCallingTool(null);

    await tool.execute({ query: "First query" });
    expect(registry.getCallingTool()).toBeNull();

    await tool.execute({ query: "Second query" });
    expect(mockClientResult.calls.length).toBe(2);
  });
});

// ─── Deep Reasoning Tool Tests ───────────────────────────────────────────────────

describe("createDeepReasoningTool", () => {
  let mockClientResult: MockClient;
  let registry: ToolRegistry;
  let tool: Tool;

  beforeEach(() => {
    mockClientResult = createMockClient();
    registry = new ToolRegistry();
    tool = createDeepReasoningTool(mockClientResult.client, mockModelConfig, registry);
  });

  it("should create tool with correct name and description", () => {
    expect(tool.name).toBe("deep_reasoning");
    expect(tool.description).toContain("reasoning model");
  });

  it("should have correct input schema", () => {
    expect(tool.inputSchema.type).toBe("object");
    expect(tool.inputSchema.properties.problem).toBeDefined();
    expect(tool.inputSchema.properties.context).toBeDefined();
    expect(tool.inputSchema.required).toContain("problem");
  });

  it("should return error when called recursively", async () => {
    registry.setCallingTool("deep_reasoning");
    const result = await tool.execute({ problem: "test problem" });
    expect(result).toContain("Error");
    expect(result).toContain("recursively");
  });

  it("should call reasoning model with problem", async () => {
    registry.setCallingTool(null);
    const result = await tool.execute({ problem: "Analyze this architecture" });
    expect(result).toContain("Mock response");
    expect(mockClientResult.calls.length).toBe(1);
    expect(mockClientResult.calls[0]?.model).toBe(mockModelConfig.reasoningModel);
  });

  it("should include context in message when provided", async () => {
    registry.setCallingTool(null);
    await tool.execute({
      problem: "Analyze this",
      context: "Additional context info",
    });
    const content = mockClientResult.calls[0]?.messages[0]?.content as string;
    expect(content).toContain("Context:");
    expect(content).toContain("Additional context info");
  });

  it("should clear callingTool after successful execution", async () => {
    registry.setCallingTool(null);
    await tool.execute({ problem: "Test problem" });
    expect(registry.getCallingTool()).toBeNull();
  });

  it("should allow sequential calls after clearing callingTool", async () => {
    registry.setCallingTool(null);

    await tool.execute({ problem: "First problem" });
    expect(registry.getCallingTool()).toBeNull();

    await tool.execute({ problem: "Second problem" });
    expect(mockClientResult.calls.length).toBe(2);
  });
});

// ─── createSubagentTools Factory Tests ───────────────────────────────────────────

describe("createSubagentTools", () => {
  let mockClientResult: MockClient;
  let registry: ToolRegistry;
  let tools: Tool[];

  beforeEach(() => {
    mockClientResult = createMockClient();
    registry = new ToolRegistry();
    tools = createSubagentTools(mockClientResult.client, mockModelConfig, registry);
  });

  it("should create all three tools", () => {
    expect(tools.length).toBe(3);
    expect(tools.map((t) => t.name)).toContain("vision_analyze");
    expect(tools.map((t) => t.name)).toContain("fast_query");
    expect(tools.map((t) => t.name)).toContain("deep_reasoning");
  });

  it("should create tools with unique names", () => {
    const names = tools.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });
});

// ─── ToolRegistry callingTool Tests ──────────────────────────────────────────────

describe("ToolRegistry callingTool", () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry();
  });

  it("should track calling tool", () => {
    registry.setCallingTool("vision_analyze");
    expect(registry.getCallingTool()).toBe("vision_analyze");
  });

  it("should clear calling tool when set to null", () => {
    registry.setCallingTool("fast_query");
    expect(registry.getCallingTool()).toBe("fast_query");
    registry.setCallingTool(null);
    expect(registry.getCallingTool()).toBeNull();
  });

  it("should return null initially", () => {
    expect(registry.getCallingTool()).toBeNull();
  });
});

// ─── Session-Aware Subagent Tests ───────────────────────────────────────────────

describe("Subagent session creation", () => {
  let mockClientResult: MockClient;
  let storage: SQLiteStorageAdapter;
  let registry: ToolRegistry;
  let context: ToolContext;

  beforeEach(() => {
    mockClientResult = createMockClient();
    storage = new SQLiteStorageAdapter(":memory:");
    registry = new ToolRegistry();

    // Create a parent session
    storage.createSession("parent-session", "Test Parent Session");

    context = {
      sessionId: "parent-session",
      storage,
      client: mockClientResult.client,
      modelConfig: mockModelConfig,
    };
  });

  it("should create child session when context is provided", async () => {
    const tool = createFastQueryTool(mockClientResult.client, mockModelConfig, registry);
    registry.setCallingTool(null);

    await tool.execute({ query: "What is the capital of France?" }, context);

    // Check child session was created
    const children = await storage.getChildSessions("parent-session");
    expect(children.length).toBe(1);
    expect(children[0]?.parentId).toBe("parent-session");
    expect(children[0]?.subagentType).toBe("fast_query");
  });

  it("should persist request and response messages in child session", async () => {
    const tool = createFastQueryTool(mockClientResult.client, mockModelConfig, registry);
    registry.setCallingTool(null);

    await tool.execute({ query: "Test query" }, context);

    const children = await storage.getChildSessions("parent-session");
    expect(children.length).toBe(1);

    const messages = await storage.getMessages(children[0]?.id ?? "");
    expect(messages.length).toBe(2);
    expect(messages[0]?.role).toBe("user");
    expect(messages[1]?.role).toBe("assistant");
  });

  it("should persist metadata including tokens and model", async () => {
    const tool = createFastQueryTool(mockClientResult.client, mockModelConfig, registry);
    registry.setCallingTool(null);

    await tool.execute({ query: "Test query" }, context);

    const children = await storage.getChildSessions("parent-session");
    const messages = await storage.getMessages(children[0]?.id ?? "");

    const responseMsg = messages[1]?.content as { type: string; metadata: Record<string, unknown> };
    expect(responseMsg?.type).toBe("subagent_response");
    expect(responseMsg?.metadata?.input_tokens).toBe(100);
    expect(responseMsg?.metadata?.output_tokens).toBe(50);
    expect(responseMsg?.metadata?.model).toBe(mockModelConfig.fastModel);
    expect(responseMsg?.metadata?.elapsed_ms).toBeDefined();
    expect(typeof responseMsg?.metadata?.elapsed_ms).toBe("number");
  });

  it("should create child session even on API error", async () => {
    // Create mock client that throws
    const errorClient = {
      messages: {
        create: async (): Promise<Message> => {
          throw new Error("API unavailable");
        },
      },
    } as unknown as Anthropic;

    const tool = createFastQueryTool(errorClient, mockModelConfig, registry);
    registry.setCallingTool(null);

    const result = await tool.execute({ query: "Test query" }, context);
    expect(result).toContain("Error");

    // Check child session was still created
    const children = await storage.getChildSessions("parent-session");
    expect(children.length).toBe(1);

    // Check error was persisted
    const messages = await storage.getMessages(children[0]?.id ?? "");
    expect(messages.length).toBe(2);
    const responseMsg = messages[1]?.content as { type: string; error: string };
    expect(responseMsg?.error).toContain("API unavailable");
  });

  it("should not create child session when context is not provided", async () => {
    const tool = createFastQueryTool(mockClientResult.client, mockModelConfig, registry);
    registry.setCallingTool(null);

    await tool.execute({ query: "Test query" }); // No context

    const children = await storage.getChildSessions("parent-session");
    expect(children.length).toBe(0);
  });

  it("should preserve image path in vision_analyze request", async () => {
    const tool = createVisionAnalyzeTool(mockClientResult.client, mockModelConfig, registry);
    registry.setCallingTool(null);

    await tool.execute(
      {
        url: "https://example.com/image.png",
        prompt: "Describe this image",
      },
      context,
    );

    const children = await storage.getChildSessions("parent-session");
    const messages = await storage.getMessages(children[0]?.id ?? "");

    const requestMsg = messages[0]?.content as { type: string; imageUrl: string };
    expect(requestMsg?.type).toBe("subagent_request");
    expect(requestMsg?.imageUrl).toBe("https://example.com/image.png");
  });
});
