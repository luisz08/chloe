import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { validatePath } from "./sandbox.js";
import type { ToolSettings } from "./settings.js";
import type { Tool } from "./types.js";

interface ReadFileInput {
  path: string;
  offset?: number;
  limit?: number;
}

export function createReadFileTool(settings: ToolSettings, cwd: string): Tool {
  return {
    name: "read_file",
    description:
      "Read a file and return its content with 1-indexed line numbers (format: `N\\tline`). " +
      "Use `offset` (1-indexed line) and `limit` (number of lines) to read a specific range — " +
      "always prefer a targeted range over reading the whole file. " +
      "Output is capped at 32 KB; if truncated, a notice tells you how many bytes were omitted " +
      "and how to fetch the next chunk.",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Path to the file. Relative paths resolve from the working directory.",
        },
        offset: {
          type: "integer",
          description: "1-indexed line number to start reading from. Default: 1.",
        },
        limit: {
          type: "integer",
          description:
            "Number of lines to read. Default: read to end (subject to max_output_bytes).",
        },
      },
      required: ["path"],
    },
    async execute(input: unknown): Promise<string> {
      const { path, offset = 1, limit } = input as ReadFileInput;

      const pathErr = validatePath(path, settings.allowedPaths, cwd);
      if (pathErr !== null) return pathErr;

      const resolved = isAbsolute(path) ? path : resolve(cwd, path);
      if (!existsSync(resolved)) return `File not found: ${path}`;

      let content: string;
      try {
        content = readFileSync(resolved, "utf-8");
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return `Error reading file: ${msg}`;
      }

      const allLines = content.split("\n");
      // Remove trailing empty entry from final newline
      if (allLines.at(-1) === "") allLines.pop();

      const startIdx = Math.max(0, offset - 1);
      const slice =
        limit !== undefined ? allLines.slice(startIdx, startIdx + limit) : allLines.slice(startIdx);

      let result = "";
      let bytesUsed = 0;
      let truncatedAt = -1;

      for (let i = 0; i < slice.length; i++) {
        const lineNum = startIdx + i + 1;
        const line = `${lineNum}\t${slice[i]}\n`;
        if (bytesUsed + line.length > settings.readFile.maxOutputBytes) {
          truncatedAt = i;
          break;
        }
        result += line;
        bytesUsed += line.length;
      }

      if (truncatedAt !== -1) {
        const approxBytes = slice.slice(truncatedAt).join("\n").length;
        result += `\n[output truncated: ~${approxBytes} bytes omitted, use offset/limit to read more]`;
      }

      return result;
    },
  };
}
