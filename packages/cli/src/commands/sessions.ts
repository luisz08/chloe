import { SQLiteStorageAdapter, loadConfig } from "@chloe/core";
import type { SessionTree } from "@chloe/core";

interface SessionsCommandOptions {
  subcommand: "list" | "delete";
  id?: string;
  tree?: string;
  children?: string;
  type?: string;
}

function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

function padEnd(str: string, length: number): string {
  return str.length >= length ? str : str + " ".repeat(length - str.length);
}

function printTree(tree: SessionTree, indent = ""): void {
  const prefix =
    indent === "" ? "" : indent.slice(0, -4) + (indent.endsWith("    ") ? "└── " : "├── ");
  const sessionInfo = tree.session.subagentType
    ? `${tree.session.id} (${tree.session.subagentType})`
    : `${tree.session.id} (root)`;
  console.log(`${prefix}${sessionInfo}`);

  for (let i = 0; i < tree.children.length; i++) {
    const isLast = i === tree.children.length - 1;
    const nextIndent = indent + (isLast ? "    " : "│   ");
    const child = tree.children[i];
    if (child !== undefined) {
      printTree(child, nextIndent);
    }
  }
}

export async function sessionsCommand({
  subcommand,
  id,
  tree,
  children,
  type,
}: SessionsCommandOptions): Promise<void> {
  const cfg = loadConfig();
  const storage = new SQLiteStorageAdapter(cfg.storage.dbPath);

  if (subcommand === "list") {
    if (tree !== undefined && id !== undefined) {
      // Show tree for specific session
      try {
        const sessionTree = await storage.getSessionTree(id);
        printTree(sessionTree);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`Error: ${message}`);
        process.exit(1);
      }
    } else if (children !== undefined && id !== undefined) {
      // Show children for specific session
      const childSessions = await storage.getChildSessions(id);
      if (childSessions.length === 0) {
        console.log("No child sessions found.");
      } else {
        console.log(`${padEnd("ID", 48)}${padEnd("TYPE", 16)}${padEnd("CREATED", 21)}`);
        for (const child of childSessions) {
          const childId = padEnd(child.id, 48);
          const childType = padEnd(child.subagentType ?? "", 16);
          const created = padEnd(formatDate(child.createdAt), 21);
          console.log(`${childId}${childType}${created}`);
        }
      }
    } else if (type !== undefined) {
      // Filter by subagent type
      const sessions = await storage.listSessionsByType(type);
      if (sessions.length === 0) {
        console.log(`No sessions found with type: ${type}`);
      } else {
        console.log(
          `${padEnd("ID", 48)}${padEnd("NAME", 16)}${padEnd("CREATED", 21)}${padEnd("LAST ACTIVE", 21)}`,
        );
        for (const session of sessions) {
          const sid = padEnd(session.id, 48);
          const name = padEnd(session.name, 16);
          const created = padEnd(formatDate(session.createdAt), 21);
          const lastActive = padEnd(formatDate(session.updatedAt), 21);
          console.log(`${sid}${name}${created}${lastActive}`);
        }
      }
    } else {
      // Default list behavior
      const sessions = await storage.listSessions();

      console.log(
        `${padEnd("ID", 16)}${padEnd("NAME", 16)}${padEnd("CREATED", 21)}${padEnd("LAST ACTIVE", 21)}`,
      );

      for (const session of sessions) {
        const sid = padEnd(session.id, 16);
        const name = padEnd(session.name, 16);
        const created = padEnd(formatDate(session.createdAt), 21);
        const lastActive = padEnd(formatDate(session.updatedAt), 21);
        console.log(`${sid}${name}${created}${lastActive}`);
      }
    }
  } else if (subcommand === "delete") {
    if (!id) {
      console.error("Error: session id required for delete");
      process.exit(1);
    }

    const deleted = await storage.deleteSession(id);
    if (deleted) {
      console.log(`Deleted session: ${id}`);
    } else {
      console.error(`Error: session '${id}' does not exist`);
      process.exit(1);
    }
  }
}
