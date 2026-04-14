import type { Agent, StorageAdapter } from "@chloe/core";
import { handlePostMessage } from "./handlers/messages.js";
import { handleDeleteSession, handleListSessions } from "./handlers/sessions.js";

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function createRouter(storage: StorageAdapter, agent: Agent) {
  return async function router(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const pathname = url.pathname;
    const method = request.method;

    // GET /sessions
    if (pathname === "/sessions") {
      if (method === "GET") {
        return handleListSessions(request, storage, agent);
      }
      return jsonError("Method not allowed", 405);
    }

    // Routes with /sessions/:id
    const parts = pathname.split("/").filter(Boolean);
    // parts[0] = "sessions", parts[1] = id, parts[2] = "messages"
    if (parts[0] === "sessions" && parts[1]) {
      const sessionId = parts[1];

      // POST /sessions/:id/messages
      if (parts[2] === "messages") {
        if (method === "POST") {
          return handlePostMessage(request, storage, agent, sessionId);
        }
        return jsonError("Method not allowed", 405);
      }

      // DELETE /sessions/:id
      if (parts.length === 2) {
        if (method === "DELETE") {
          return handleDeleteSession(request, storage, agent, sessionId);
        }
        return jsonError("Method not allowed", 405);
      }
    }

    return jsonError("Not found", 404);
  };
}
