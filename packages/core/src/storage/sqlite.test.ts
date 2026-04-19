import { describe, expect, test } from "bun:test";
import { SQLiteStorageAdapter } from "./sqlite.js";

function makeAdapter(): SQLiteStorageAdapter {
  return new SQLiteStorageAdapter(":memory:");
}

describe("SQLiteStorageAdapter", () => {
  test("createSession returns correct Session object", async () => {
    const adapter = makeAdapter();
    const session = await adapter.createSession("my-project", "My Project");
    expect(session.id).toBe("my-project");
    expect(session.name).toBe("My Project");
    expect(typeof session.createdAt).toBe("number");
    expect(typeof session.updatedAt).toBe("number");
    expect(session.createdAt).toBe(session.updatedAt);
  });

  test("getSession returns session by id; returns null for unknown id", async () => {
    const adapter = makeAdapter();
    await adapter.createSession("test-session", "Test Session");

    const found = await adapter.getSession("test-session");
    expect(found).not.toBeNull();
    expect(found?.id).toBe("test-session");
    expect(found?.name).toBe("Test Session");

    const notFound = await adapter.getSession("does-not-exist");
    expect(notFound).toBeNull();
  });

  test("listSessions returns SessionSummary array with correct messageCount", async () => {
    const adapter = makeAdapter();
    await adapter.createSession("session-a", "Session A");
    await adapter.createSession("session-b", "Session B");

    await adapter.appendMessage("session-a", "user", "hello");
    await adapter.appendMessage("session-a", "assistant", "hi there");

    const sessions = await adapter.listSessions();
    expect(sessions.length).toBe(2);

    const sessionA = sessions.find((s) => s.id === "session-a");
    const sessionB = sessions.find((s) => s.id === "session-b");

    expect(sessionA?.messageCount).toBe(2);
    expect(sessionB?.messageCount).toBe(0);
  });

  test("deleteSession returns true for existing; false for non-existent", async () => {
    const adapter = makeAdapter();
    await adapter.createSession("to-delete", "To Delete");

    const deleted = await adapter.deleteSession("to-delete");
    expect(deleted).toBe(true);

    const deletedAgain = await adapter.deleteSession("to-delete");
    expect(deletedAgain).toBe(false);

    const notFound = await adapter.deleteSession("never-existed");
    expect(notFound).toBe(false);
  });

  test("appendMessage + getMessages roundtrip with JSON content", async () => {
    const adapter = makeAdapter();
    await adapter.createSession("chat", "Chat");

    const content = [{ type: "text", text: "Hello world" }];
    const message = await adapter.appendMessage("chat", "user", content);

    expect(message.sessionId).toBe("chat");
    expect(message.role).toBe("user");
    expect(message.content).toEqual(content);
    expect(typeof message.id).toBe("string");
    expect(typeof message.createdAt).toBe("number");

    const messages = await adapter.getMessages("chat");
    expect(messages.length).toBe(1);
    expect(messages[0]?.content).toEqual(content);
    expect(messages[0]?.role).toBe("user");
  });

  test("cascade delete removes messages when session is deleted", async () => {
    const adapter = makeAdapter();
    await adapter.createSession("cascade-test", "Cascade Test");

    await adapter.appendMessage("cascade-test", "user", "message 1");
    await adapter.appendMessage("cascade-test", "assistant", "message 2");

    const messagesBefore = await adapter.getMessages("cascade-test");
    expect(messagesBefore.length).toBe(2);

    await adapter.deleteSession("cascade-test");

    const messagesAfter = await adapter.getMessages("cascade-test");
    expect(messagesAfter.length).toBe(0);
  });

  test("touchSession updates updatedAt", async () => {
    const adapter = makeAdapter();
    const session = await adapter.createSession("touch-test", "Touch Test");
    const originalUpdatedAt = session.updatedAt;

    // Small delay to ensure timestamp difference
    await new Promise((resolve) => setTimeout(resolve, 5));
    await adapter.touchSession("touch-test");

    const updated = await adapter.getSession("touch-test");
    expect(updated?.updatedAt).toBeGreaterThanOrEqual(originalUpdatedAt);
  });

  test("getLastSession returns null when no sessions exist", async () => {
    const adapter = makeAdapter();
    const result = await adapter.getLastSession();
    expect(result).toBeNull();
  });

  test("getLastSession returns session with highest updatedAt", async () => {
    const adapter = makeAdapter();
    await adapter.createSession("session-old", "Old Session");
    await adapter.createSession("session-new", "New Session");

    // Touch session-old to make it more recent
    await new Promise((resolve) => setTimeout(resolve, 5));
    await adapter.touchSession("session-old");

    const lastSession = await adapter.getLastSession();
    expect(lastSession?.id).toBe("session-old");
  });

  test("getLastSession returns the only session when one exists", async () => {
    const adapter = makeAdapter();
    await adapter.createSession("only-session", "Only Session");

    const lastSession = await adapter.getLastSession();
    expect(lastSession?.id).toBe("only-session");
    expect(lastSession?.name).toBe("Only Session");
  });
});

// ─── Child Session Tests ────────────────────────────────────────────────────────

describe("SQLiteStorageAdapter child sessions", () => {
  function makeAdapter(): SQLiteStorageAdapter {
    return new SQLiteStorageAdapter(":memory:");
  }

  describe("createChildSession", () => {
    test("should create child session with parent association", async () => {
      const adapter = makeAdapter();
      const _parent = await adapter.createSession("parent-1", "Parent Session");
      const child = await adapter.createChildSession("parent-1", "fast_query", "fast_query: Test");

      expect(child.parentId).toBe("parent-1");
      expect(child.subagentType).toBe("fast_query");
      expect(child.id).toContain("parent-1");
      expect(child.id).toContain("fast_query");
    });

    test("should generate unique IDs for sequential calls", async () => {
      const adapter = makeAdapter();
      const _parent = await adapter.createSession("parent-1", "Parent Session");

      const child1 = await adapter.createChildSession("parent-1", "fast_query", "Query 1");
      const child2 = await adapter.createChildSession("parent-1", "fast_query", "Query 2");

      expect(child1.id).not.toBe(child2.id);
    });

    test("should set correct title", async () => {
      const adapter = makeAdapter();
      const _parent = await adapter.createSession("parent-1", "Parent Session");
      const child = await adapter.createChildSession(
        "parent-1",
        "vision_analyze",
        "vision_analyze: Describe image",
      );

      expect(child.name).toBe("vision_analyze: Describe image");
    });
  });

  describe("getChildSessions", () => {
    test("should return empty array when no children", async () => {
      const adapter = makeAdapter();
      const _parent = await adapter.createSession("parent-1", "Parent Session");
      const children = await adapter.getChildSessions("parent-1");

      expect(children.length).toBe(0);
    });

    test("should return children in chronological order", async () => {
      const adapter = makeAdapter();
      const _parent = await adapter.createSession("parent-1", "Parent Session");

      const child1 = await adapter.createChildSession("parent-1", "fast_query", "Query 1");
      const child2 = await adapter.createChildSession("parent-1", "vision_analyze", "Vision 2");

      const children = await adapter.getChildSessions("parent-1");

      expect(children.length).toBe(2);
      expect(children[0]?.id).toBe(child1.id);
      expect(children[1]?.id).toBe(child2.id);
    });

    test("should only return direct children", async () => {
      const adapter = makeAdapter();
      const _parent = await adapter.createSession("parent-1", "Parent Session");
      const child = await adapter.createChildSession("parent-1", "fast_query", "Child");
      await adapter.createChildSession(child.id, "vision_analyze", "Grandchild");

      const children = await adapter.getChildSessions("parent-1");

      expect(children.length).toBe(1);
      expect(children[0]?.id).toBe(child.id);
    });
  });

  describe("getSessionTree", () => {
    test("should throw for non-existent session", async () => {
      const adapter = makeAdapter();
      await expect(adapter.getSessionTree("nonexistent")).rejects.toThrow("Session not found");
    });

    test("should return single-node tree for session without children", async () => {
      const adapter = makeAdapter();
      const _session = await adapter.createSession("root-1", "Root Session");

      const tree = await adapter.getSessionTree("root-1");

      expect(tree.session.id).toBe("root-1");
      expect(tree.children.length).toBe(0);
      expect(tree.messages.length).toBe(0);
    });

    test("should return nested tree for multi-level hierarchy", async () => {
      const adapter = makeAdapter();
      const _root = await adapter.createSession("root-1", "Root");
      const child1 = await adapter.createChildSession("root-1", "fast_query", "Child 1");
      const child2 = await adapter.createChildSession("root-1", "vision_analyze", "Child 2");
      await adapter.createChildSession(child1.id, "deep_reasoning", "Grandchild");

      const tree = await adapter.getSessionTree("root-1");

      expect(tree.session.id).toBe("root-1");
      expect(tree.children.length).toBe(2);
      expect(tree.children[0]?.session.id).toBe(child1.id);
      expect(tree.children[0]?.children.length).toBe(1);
      expect(tree.children[1]?.session.id).toBe(child2.id);
      expect(tree.children[1]?.children.length).toBe(0);
    });

    test("should include messages in tree nodes", async () => {
      const adapter = makeAdapter();
      const _root = await adapter.createSession("root-1", "Root");
      await adapter.appendMessage("root-1", "user", "Hello");
      await adapter.appendMessage("root-1", "assistant", "Hi there");

      const tree = await adapter.getSessionTree("root-1");

      expect(tree.messages.length).toBe(2);
      expect(tree.messages[0]?.role).toBe("user");
      expect(tree.messages[1]?.role).toBe("assistant");
    });

    test("should respect maxDepth parameter", async () => {
      const adapter = makeAdapter();
      const _root = await adapter.createSession("root-1", "Root");
      const child = await adapter.createChildSession("root-1", "fast_query", "Child");
      await adapter.createChildSession(child.id, "vision_analyze", "Grandchild");

      const tree = await adapter.getSessionTree("root-1", 1);

      expect(tree.session.id).toBe("root-1");
      expect(tree.children.length).toBe(1);
      expect(tree.children[0]?.children.length).toBe(0); // Grandchild not included due to maxDepth
    });
  });

  describe("listSessionsByType", () => {
    test("should return sessions filtered by type", async () => {
      const adapter = makeAdapter();
      const _parent = await adapter.createSession("parent-1", "Parent");
      await adapter.createChildSession("parent-1", "fast_query", "Fast 1");
      await adapter.createChildSession("parent-1", "vision_analyze", "Vision 1");
      await adapter.createChildSession("parent-1", "fast_query", "Fast 2");

      const fastSessions = await adapter.listSessionsByType("fast_query");

      expect(fastSessions.length).toBe(2);
      expect(fastSessions[0]?.subagentType).toBe("fast_query");
      expect(fastSessions[1]?.subagentType).toBe("fast_query");
    });

    test("should return empty array for non-existent type", async () => {
      const adapter = makeAdapter();
      const _parent = await adapter.createSession("parent-1", "Parent");
      await adapter.createChildSession("parent-1", "fast_query", "Fast");

      const deepSessions = await adapter.listSessionsByType("deep_reasoning");

      expect(deepSessions.length).toBe(0);
    });

    test("should include message count in summary", async () => {
      const adapter = makeAdapter();
      const _parent = await adapter.createSession("parent-1", "Parent");
      const child = await adapter.createChildSession("parent-1", "fast_query", "Fast");
      await adapter.appendMessage(child.id, "user", { type: "subagent_request", prompt: "Test" });
      await adapter.appendMessage(child.id, "assistant", {
        type: "subagent_response",
        text: "Response",
      });

      const sessions = await adapter.listSessionsByType("fast_query");

      expect(sessions[0]?.messageCount).toBe(2);
    });
  });

  describe("backward compatibility", () => {
    test("should work with sessions created before schema extension", async () => {
      const adapter = makeAdapter();
      // Create session the old way
      const session = await adapter.createSession("old-session", "Old Session");

      expect(session.parentId).toBeNull();
      expect(session.subagentType).toBeNull();

      // Should be able to get it
      const retrieved = await adapter.getSession("old-session");
      expect(retrieved?.parentId).toBeNull();
      expect(retrieved?.subagentType).toBeNull();
    });
  });
});
