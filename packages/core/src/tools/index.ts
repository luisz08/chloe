import type { SearchConfig } from "../config.js";
import { createBashTool } from "./bash.js";
import { createReadFileTool } from "./read-file.js";
import type { ToolSettings } from "./settings.js";
import type { Tool } from "./types.js";
import { createWebFetchTool } from "./web-fetch.js";
import { createWebSearchTool } from "./web-search.js";
import { createWriteFileTool } from "./write-file.js";

export { DEFAULT_TOOL_SETTINGS, loadToolSettings } from "./settings.js";
export type { ToolSettings } from "./settings.js";
export { createSubagentTools } from "./subagent.js";

export function createDefaultTools(
  settings: ToolSettings,
  cwd: string,
  permissionRef?: { current: ((binaryName: string) => Promise<boolean>) | null },
  searchConfig?: SearchConfig,
): Tool[] {
  const tools: Tool[] = [
    createBashTool(settings, cwd, permissionRef),
    createReadFileTool(settings, cwd),
    createWriteFileTool(settings, cwd),
    createWebFetchTool(),
  ];

  if (searchConfig !== undefined) {
    tools.push(createWebSearchTool(searchConfig));
  }

  return tools;
}
