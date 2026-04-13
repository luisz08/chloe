import type { Tool } from "./types.js";

export const EchoTool: Tool = {
  name: "echo",
  description: "Returns the input message unchanged.",
  inputSchema: {
    type: "object",
    properties: {
      message: {
        type: "string",
        description: "The message to echo back.",
      },
    },
    required: ["message"],
  },
  async execute(input: unknown): Promise<string> {
    const parsed = input as { message: string };
    return parsed.message;
  },
};
