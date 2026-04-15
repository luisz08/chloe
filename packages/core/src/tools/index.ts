import { createBashTool } from "./bash.js";
import { createReadFileTool } from "./read-file.js";
import type { ToolSettings } from "./settings.js";
import type { Tool } from "./types.js";
import { createWriteFileTool } from "./write-file.js";

export { DEFAULT_TOOL_SETTINGS, loadToolSettings } from "./settings.js";
export type { ToolSettings } from "./settings.js";

export function createDefaultTools(
  settings: ToolSettings,
  cwd: string,
  permissionRef?: { current: ((binaryName: string) => Promise<boolean>) | null },
): Tool[] {
  return [
    createBashTool(settings, cwd, permissionRef),
    createReadFileTool(settings, cwd),
    createWriteFileTool(settings, cwd),
  ];
}
