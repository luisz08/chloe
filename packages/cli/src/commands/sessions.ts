import { homedir } from "node:os";
import { join } from "node:path";
import { SQLiteStorageAdapter } from "@chloe/core";

interface SessionsCommandOptions {
  subcommand: "list" | "delete";
  id?: string;
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

export async function sessionsCommand({ subcommand, id }: SessionsCommandOptions): Promise<void> {
  const dbPath = process.env.CHLOE_DB_PATH ?? join(homedir(), ".chloe", "chloe.db");
  const storage = new SQLiteStorageAdapter(dbPath);

  if (subcommand === "list") {
    const sessions = await storage.listSessions();

    console.log(
      `${padEnd("ID", 16)}${padEnd("NAME", 16)}${padEnd("CREATED", 21)}${padEnd("LAST ACTIVE", 21)}`,
    );

    for (const session of sessions) {
      const id = padEnd(session.id, 16);
      const name = padEnd(session.name, 16);
      const created = padEnd(formatDate(session.createdAt), 21);
      const lastActive = padEnd(formatDate(session.updatedAt), 21);
      console.log(`${id}${name}${created}${lastActive}`);
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
