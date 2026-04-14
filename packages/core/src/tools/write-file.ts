import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { validatePath } from "./sandbox.js";
import type { ToolSettings } from "./settings.js";
import type { Tool } from "./types.js";

interface WriteFileInput {
  path: string;
  content: string;
}

export function createWriteFileTool(settings: ToolSettings, cwd: string): Tool {
  return {
    name: "write_file",
    description:
      "Write content to a file, creating it or overwriting it entirely. " +
      "Parent directories are created automatically if they do not exist. " +
      "Returns a short confirmation with the byte count written. " +
      "Use `read_file` first if you need to do a partial update.",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description:
            "Path to write. Relative paths resolve from the working directory. " +
            "Parent directories are created automatically if they do not exist.",
        },
        content: {
          type: "string",
          description: "Full file content to write.",
        },
      },
      required: ["path", "content"],
    },
    async execute(input: unknown): Promise<string> {
      const { path, content } = input as WriteFileInput;

      const pathErr = validatePath(path, settings.allowedPaths, cwd);
      if (pathErr !== null) return pathErr;

      const resolved = isAbsolute(path) ? path : resolve(cwd, path);

      try {
        mkdirSync(dirname(resolved), { recursive: true });
        writeFileSync(resolved, content, "utf-8");
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return `Error writing file: ${msg}`;
      }

      return `Written ${Buffer.byteLength(content, "utf-8")} bytes to ${path}`;
    },
  };
}
