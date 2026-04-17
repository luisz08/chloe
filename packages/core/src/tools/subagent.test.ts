import { beforeEach, describe, expect, it } from "bun:test";
import type Anthropic from "@anthropic-ai/sdk";
import type { Message } from "@anthropic-ai/sdk/resources/messages";
import type { ResolvedModelConfig } from "../agent/types.js";
import { ToolRegistry } from "./registry.js";
import {
  createDeepReasoningTool,
  createFastQueryTool,
  createSubagentTools,
  createVisionAnalyzeTool,
} from "./subagent.js";
import type { Tool } from "./types.js";

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
    const result = await tool.execute({ prompt: "test" });
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
