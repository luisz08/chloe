import type { Agent, StorageAdapter } from "@chloe/core";

export async function handleListSessions(
  _request: Request,
  storage: StorageAdapter,
  _agent: Agent,
): Promise<Response> {
  const sessions = await storage.listSessions();
  return new Response(JSON.stringify(sessions), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

export async function handleDeleteSession(
  _request: Request,
  storage: StorageAdapter,
  _agent: Agent,
  sessionId: string,
): Promise<Response> {
  const deleted = await storage.deleteSession(sessionId);
  if (!deleted) {
    return new Response(JSON.stringify({ error: "Session not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }
  return new Response(JSON.stringify({ deleted: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
