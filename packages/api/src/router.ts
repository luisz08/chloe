import type { Agent, StorageAdapter } from "@chloe/core";
import { getLogger } from "@chloe/core";
import { handlePostMessage } from "./handlers/messages.js";
import { handleDeleteSession, handleListSessions } from "./handlers/sessions.js";

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function createRouter(storage: StorageAdapter, agent: Agent) {
  const log = getLogger("api");

  return async function router(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const pathname = url.pathname;
    const method = request.method;
    const startMs = Date.now();

    log.info("request", { method, path: pathname });

    const respond = (r: Response): Response => {
      log.debug("response", { status: r.status, elapsed_ms: Date.now() - startMs });
      return r;
    };

    // GET /sessions
    if (pathname === "/sessions") {
      if (method === "GET") {
        return respond(await handleListSessions(request, storage, agent));
      }
      return respond(jsonError("Method not allowed", 405));
    }

    // Routes with /sessions/:id
    const parts = pathname.split("/").filter(Boolean);
    // parts[0] = "sessions", parts[1] = id, parts[2] = "messages"
    if (parts[0] === "sessions" && parts[1]) {
      const sessionId = parts[1];

      // POST /sessions/:id/messages
      if (parts[2] === "messages") {
        if (method === "POST") {
          return respond(await handlePostMessage(request, storage, agent, sessionId));
        }
        return respond(jsonError("Method not allowed", 405));
      }

      // DELETE /sessions/:id
      if (parts.length === 2) {
        if (method === "DELETE") {
          return respond(await handleDeleteSession(request, storage, agent, sessionId));
        }
        return respond(jsonError("Method not allowed", 405));
      }
    }

    return respond(jsonError("Not found", 404));
  };
}
