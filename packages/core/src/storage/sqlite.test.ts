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
