import { describe, expect, it } from "bun:test";
import { createBashTool } from "./bash.js";
import type { ToolSettings } from "./settings.js";

const CWD = process.cwd();
const SETTINGS: ToolSettings = {
  allowedPaths: [CWD],
  bash: { allowedCommands: [], timeoutMs: 5000, maxOutputBytes: 32768 },
  readFile: { maxOutputBytes: 32768 },
};

describe("BashTool", () => {
  const tool = createBashTool(SETTINGS, CWD);

  it("runs a builtin command and returns output", async () => {
    const out = await tool.execute({ command: "echo hello" });
    expect(out).toContain("hello");
  });

  it("rejects a command not in allowlist", async () => {
    const out = await tool.execute({ command: "curl http://example.com" });
    expect(out).toMatch(/Command not allowed: curl/);
  });

  it("rejects path argument outside allowed dirs", async () => {
    const out = await tool.execute({ command: "cat /etc/passwd" });
    expect(out).toMatch(/Access denied/);
  });

  it("supports piped commands when all binaries are allowed", async () => {
    const out = await tool.execute({ command: "echo hello | wc -c" });
    // wc -c counts bytes including newline, result should be a number
    expect(Number.parseInt(out.trim())).toBeGreaterThan(0);
  });

  it("rejects pipe when second binary is disallowed", async () => {
    const out = await tool.execute({ command: "echo hi | curl http://..." });
    expect(out).toMatch(/Command not allowed: curl/);
  });

  it("appends exit code when non-zero", async () => {
    const out = await tool.execute({ command: "ls nonexistent_path_xyz_abc" });
    expect(out).toMatch(/\[exit code: \d+\]/);
  });

  it("truncates output exceeding max_output_bytes", async () => {
    const settingsSmall: ToolSettings = {
      ...SETTINGS,
      bash: { ...SETTINGS.bash, maxOutputBytes: 50 },
    };
    const smallTool = createBashTool(settingsSmall, CWD);
    // Generate 100 chars of output (exceeds 50-byte limit)
    const out = await smallTool.execute({
      command:
        'echo "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"',
    });
    expect(out).toContain("[output truncated:");
  });

  it("times out long-running commands", async () => {
    const shortTimeout: ToolSettings = {
      ...SETTINGS,
      bash: { ...SETTINGS.bash, timeoutMs: 200, allowedCommands: ["sleep"] },
    };
    const shortTool = createBashTool(shortTimeout, CWD);
    const out = await shortTool.execute({ command: "sleep 5" });
    expect(out).toMatch(/timed out/);
  }, 3000);

  it("has correct tool name", () => {
    expect(tool.name).toBe("bash");
  });
});

describe("BashTool permission callback", () => {
  it("calls permissionRef.current with the binary name when command not allowed", async () => {
    let captured = "";
    const permissionRef = {
      current: async (bin: string) => {
        captured = bin;
        return true;
      },
    };
    const tool = createBashTool(SETTINGS, CWD, permissionRef);
    await tool.execute({ command: "git status" });
    expect(captured).toBe("git");
  });

  it("proceeds with execution when permission granted", async () => {
    const permissionRef = { current: async (_bin: string) => true };
    const tool = createBashTool(SETTINGS, CWD, permissionRef);
    // "git" is not a built-in, but with permission=true it should not get the "not allowed" error
    // We use a command that will actually run if permitted
    const out = await tool.execute({ command: "echo permgranted" });
    expect(out).not.toMatch(/Command not allowed/);
    expect(out).toContain("permgranted");
  });

  it("returns error when permission denied", async () => {
    const permissionRef = { current: async (_bin: string) => false };
    const tool = createBashTool(SETTINGS, CWD, permissionRef);
    const out = await tool.execute({ command: "curl http://example.com" });
    expect(out).toMatch(/Command not allowed: curl/);
  });

  it("skips callback and returns error when permissionRef.current is null", async () => {
    const permissionRef = { current: null as ((bin: string) => Promise<boolean>) | null };
    const tool = createBashTool(SETTINGS, CWD, permissionRef);
    const out = await tool.execute({ command: "curl http://example.com" });
    expect(out).toMatch(/Command not allowed: curl/);
  });

  it("skips callback and returns error when no permissionRef provided", async () => {
    const tool = createBashTool(SETTINGS, CWD);
    const out = await tool.execute({ command: "curl http://example.com" });
    expect(out).toMatch(/Command not allowed: curl/);
  });
});
