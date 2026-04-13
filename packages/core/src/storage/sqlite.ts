import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { Message, Session, SessionSummary } from "../session/types.js";
import type { StorageAdapter } from "./adapter.js";

const DDL = `
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages(session_id);
`;

interface SessionRow {
  id: string;
  name: string;
  created_at: number;
  updated_at: number;
}

interface SessionSummaryRow extends SessionRow {
  message_count: number;
}

interface MessageRow {
  id: string;
  session_id: string;
  role: string;
  content: string;
  created_at: number;
}

function rowToSession(row: SessionRow): Session {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToMessage(row: MessageRow): Message {
  return {
    id: row.id,
    sessionId: row.session_id,
    role: row.role as Message["role"],
    content: JSON.parse(row.content) as unknown,
    createdAt: row.created_at,
  };
}

export class SQLiteStorageAdapter implements StorageAdapter {
  private db: Database;

  constructor(dbPath: string) {
    if (dbPath !== ":memory:") {
      mkdirSync(dirname(dbPath), { recursive: true });
    }
    this.db = new Database(dbPath);
    this.db.run("PRAGMA journal_mode = WAL");
    this.db.run("PRAGMA foreign_keys = ON");
    this.db.run(DDL);
  }

  async createSession(id: string, name: string): Promise<Session> {
    const now = Date.now();
    this.db
      .prepare("INSERT INTO sessions (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)")
      .run(id, name, now, now);
    return { id, name, createdAt: now, updatedAt: now };
  }

  async getSession(id: string): Promise<Session | null> {
    const row = this.db
      .prepare<SessionRow, string>(
        "SELECT id, name, created_at, updated_at FROM sessions WHERE id = ?",
      )
      .get(id);
    return row ? rowToSession(row) : null;
  }

  async listSessions(): Promise<SessionSummary[]> {
    const rows = this.db
      .prepare<SessionSummaryRow, []>(
        `SELECT s.id, s.name, s.created_at, s.updated_at,
          COUNT(m.id) AS message_count
        FROM sessions s
        LEFT JOIN messages m ON m.session_id = s.id
        GROUP BY s.id
        ORDER BY s.updated_at DESC`,
      )
      .all();
    return rows.map((row) => ({
      ...rowToSession(row),
      messageCount: row.message_count,
    }));
  }

  async deleteSession(id: string): Promise<boolean> {
    const result = this.db.prepare<SessionRow, string>("DELETE FROM sessions WHERE id = ?").run(id);
    return result.changes > 0;
  }

  async touchSession(id: string): Promise<void> {
    this.db.prepare("UPDATE sessions SET updated_at = ? WHERE id = ?").run(Date.now(), id);
  }

  async appendMessage(
    sessionId: string,
    role: "user" | "assistant" | "tool",
    content: unknown,
  ): Promise<Message> {
    const id = crypto.randomUUID();
    const createdAt = Date.now();
    const serialized = JSON.stringify(content);
    this.db
      .prepare(
        "INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)",
      )
      .run(id, sessionId, role, serialized, createdAt);
    return { id, sessionId, role, content, createdAt };
  }

  async getMessages(sessionId: string): Promise<Message[]> {
    const rows = this.db
      .prepare<MessageRow, string>(
        "SELECT id, session_id, role, content, created_at FROM messages WHERE session_id = ? ORDER BY created_at ASC",
      )
      .all(sessionId);
    return rows.map(rowToMessage);
  }
}
