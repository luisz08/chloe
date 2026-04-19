import { homedir } from "node:os";
import { join } from "node:path";
import type { Agent } from "@chloe/core";
import type { StorageAdapter } from "@chloe/core";
import { routeCommand } from "@chloe/core";
import type { RouterOptions } from "@chloe/core";

export async function handlePostMessage(
  request: Request,
  _storage: StorageAdapter,
  agent: Agent,
  sessionId: string,
): Promise<Response> {
  let body: { content?: unknown };
  try {
    body = (await request.json()) as { content?: unknown };
  } catch {
    return new Response(JSON.stringify({ error: "content is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const content = body.content;
  if (!content || typeof content !== "string" || content.trim() === "") {
    return new Response(JSON.stringify({ error: "content is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const opts: RouterOptions = {
    globalSkillsDir: join(homedir(), ".chloe", "skills"),
    projectSkillsDir: join(process.cwd(), ".chloe", "skills"),
  };

  const routeResult = await routeCommand(content, opts);

  if (routeResult.kind === "internal") {
    return new Response(routeResult.output, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }

  if (routeResult.kind === "error") {
    return new Response(JSON.stringify({ error: routeResult.message }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const messageContent = routeResult.kind === "skill" ? routeResult.expandedContent : content;

  const stream = new ReadableStream({
    async start(controller) {
      const encode = (chunk: string) => new TextEncoder().encode(chunk);
      try {
        await agent.run(sessionId, messageContent, {
          onToken: (text) =>
            controller.enqueue(encode(`data: ${JSON.stringify({ type: "token", text })}\n\n`)),
          onToolCall: (name, input) =>
            controller.enqueue(
              encode(`data: ${JSON.stringify({ type: "tool_call", name, input })}\n\n`),
            ),
          onToolResult: (name, output) =>
            controller.enqueue(
              encode(`data: ${JSON.stringify({ type: "tool_result", name, output })}\n\n`),
            ),
          confirmTool: async () => true,
        });
        controller.enqueue(encode("data: [DONE]\n\n"));
      } catch {
        controller.enqueue(
          encode(
            `data: ${JSON.stringify({ type: "error", message: "Internal server error" })}\n\n`,
          ),
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
