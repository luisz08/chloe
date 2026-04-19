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

export async function handleGetChildren(
  _request: Request,
  storage: StorageAdapter,
  sessionId: string,
): Promise<Response> {
  const children = await storage.getChildSessions(sessionId);
  return new Response(JSON.stringify(children), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

export async function handleGetTree(
  request: Request,
  storage: StorageAdapter,
  sessionId: string,
): Promise<Response> {
  // Parse maxDepth from query params
  const url = new URL(request.url);
  const maxDepthParam = url.searchParams.get("maxDepth");
  const maxDepth = maxDepthParam !== null ? Number.parseInt(maxDepthParam, 10) : 10;

  try {
    const tree = await storage.getSessionTree(sessionId, maxDepth);
    return new Response(JSON.stringify(tree), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: message }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }
}
