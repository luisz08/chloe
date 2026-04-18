import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { getLogger } from "../logger/index.js";
import type { Message, Session, SessionSummary, SessionTree } from "../session/types.js";
import type { StorageAdapter } from "./adapter.js";

const DDL = `
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  parent_id TEXT DEFAULT NULL,
  subagent_type TEXT DEFAULT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages(session_id);
CREATE INDEX IF NOT EXISTS idx_sessions_parent_id ON sessions(parent_id);
`;

interface SessionRow {
  id: string;
  name: string;
  created_at: number;
  updated_at: number;
  parent_id: string | null;
  subagent_type: string | null;
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
    parentId: row.parent_id,
    subagentType: row.subagent_type,
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

    // Migration: Add new columns if they don't exist (for existing databases)
    try {
      this.db.run("ALTER TABLE sessions ADD COLUMN parent_id TEXT DEFAULT NULL");
    } catch {
      // Column already exists, ignore
    }
    try {
      this.db.run("ALTER TABLE sessions ADD COLUMN subagent_type TEXT DEFAULT NULL");
    } catch {
      // Column already exists, ignore
    }
    try {
      this.db.run("CREATE INDEX IF NOT EXISTS idx_sessions_parent_id ON sessions(parent_id)");
    } catch {
      // Index already exists, ignore
    }
  }

  async createSession(id: string, name: string): Promise<Session> {
    const now = Date.now();
    this.db
      .prepare(
        "INSERT INTO sessions (id, name, created_at, updated_at, parent_id, subagent_type) VALUES (?, ?, ?, ?, NULL, NULL)",
      )
      .run(id, name, now, now);
    getLogger("storage").debug("session created", { session: id });
    return { id, name, createdAt: now, updatedAt: now, parentId: null, subagentType: null };
  }

  async getSession(id: string): Promise<Session | null> {
    const row = this.db
      .prepare<SessionRow, string>(
        "SELECT id, name, created_at, updated_at, parent_id, subagent_type FROM sessions WHERE id = ?",
      )
      .get(id);
    return row ? rowToSession(row) : null;
  }

  async getLastSession(): Promise<Session | null> {
    const row = this.db
      .prepare<SessionRow, []>(
        "SELECT id, name, created_at, updated_at, parent_id, subagent_type FROM sessions ORDER BY updated_at DESC LIMIT 1",
      )
      .get();
    return row ? rowToSession(row) : null;
  }

  async listSessions(): Promise<SessionSummary[]> {
    const rows = this.db
      .prepare<SessionSummaryRow, []>(
        `SELECT s.id, s.name, s.created_at, s.updated_at, s.parent_id, s.subagent_type,
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
    const messages = rows.map(rowToMessage);
    getLogger("storage").debug("session loaded", {
      session: sessionId,
      message_count: messages.length,
    });
    return messages;
  }

  async createChildSession(
    parentId: string,
    subagentType: "vision_analyze" | "fast_query" | "deep_reasoning",
    title: string,
  ): Promise<Session> {
    const id = `${parentId}-${subagentType}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
    const now = Date.now();
    this.db
      .prepare(
        "INSERT INTO sessions (id, name, created_at, updated_at, parent_id, subagent_type) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(id, title, now, now, parentId, subagentType);
    getLogger("storage").debug("child session created", {
      session: id,
      parent: parentId,
      type: subagentType,
    });
    return {
      id,
      name: title,
      createdAt: now,
      updatedAt: now,
      parentId: parentId,
      subagentType: subagentType,
    };
  }

  async getChildSessions(parentId: string): Promise<Session[]> {
    const rows = this.db
      .prepare<SessionRow, string>(
        "SELECT id, name, created_at, updated_at, parent_id, subagent_type FROM sessions WHERE parent_id = ? ORDER BY created_at ASC",
      )
      .all(parentId);
    getLogger("storage").debug("child sessions loaded", { parent: parentId, count: rows.length });
    return rows.map(rowToSession);
  }

  async getSessionTree(rootId: string, maxDepth = 10): Promise<SessionTree> {
    const rootSession = await this.getSession(rootId);
    if (rootSession === null) {
      throw new Error(`Session not found: ${rootId}`);
    }

    // Recursive CTE to fetch all descendants
    const treeRows = this.db
      .prepare<SessionRow & { depth: number }, [string, number]>(
        `WITH RECURSIVE session_tree AS (
          SELECT id, name, created_at, updated_at, parent_id, subagent_type, 0 as depth
          FROM sessions WHERE id = ?
          UNION ALL
          SELECT s.id, s.name, s.created_at, s.updated_at, s.parent_id, s.subagent_type, st.depth + 1
          FROM sessions s
          JOIN session_tree st ON s.parent_id = st.id
          WHERE st.depth < ?
        )
        SELECT * FROM session_tree ORDER BY depth, created_at`,
      )
      .all(rootId, maxDepth);

    // Build tree structure
    const sessionMap = new Map<string, SessionTree>();
    for (const row of treeRows) {
      const session = rowToSession(row);
      const messages = await this.getMessages(session.id);
      sessionMap.set(session.id, { session, messages, children: [] });
    }

    // Link children to parents
    const root = sessionMap.get(rootId);
    if (root === undefined) {
      throw new Error(`Session not found: ${rootId}`);
    }

    for (const [_sessionId, tree] of sessionMap) {
      if (tree.session.parentId !== null) {
        const parent = sessionMap.get(tree.session.parentId);
        if (parent !== undefined) {
          parent.children.push(tree);
        }
      }
    }

    getLogger("storage").debug("session tree loaded", { root: rootId, nodes: sessionMap.size });
    return root;
  }

  async listSessionsByType(subagentType: string): Promise<SessionSummary[]> {
    const rows = this.db
      .prepare<SessionSummaryRow, string>(
        `SELECT s.id, s.name, s.created_at, s.updated_at, s.parent_id, s.subagent_type,
          COUNT(m.id) AS message_count
        FROM sessions s
        LEFT JOIN messages m ON m.session_id = s.id
        WHERE s.subagent_type = ?
        GROUP BY s.id
        ORDER BY s.updated_at DESC`,
      )
      .all(subagentType);
    return rows.map((row) => ({
      ...rowToSession(row),
      messageCount: row.message_count,
    }));
  }
}
