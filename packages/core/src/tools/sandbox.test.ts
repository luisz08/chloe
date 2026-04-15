import { describe, expect, it } from "bun:test";
import { BUILTIN_COMMANDS, validateBashCommand, validatePath } from "./sandbox.js";

const CWD = "/project";
const ALLOWED = ["/project", "/data/shared"];

describe("validatePath", () => {
  it("allows a relative path inside cwd", () => {
    expect(validatePath("src/index.ts", ALLOWED, CWD)).toBeNull();
  });

  it("allows an absolute path inside allowed_paths", () => {
    expect(validatePath("/project/README.md", ALLOWED, CWD)).toBeNull();
  });

  it("allows a path in the second allowed directory", () => {
    expect(validatePath("/data/shared/report.csv", ALLOWED, CWD)).toBeNull();
  });

  it("rejects path traversal to outside allowed dirs", () => {
    const err = validatePath("../../etc/passwd", ALLOWED, CWD);
    expect(err).toMatch(/Access denied/);
  });

  it("rejects absolute path outside all allowed dirs", () => {
    const err = validatePath("/etc/hosts", ALLOWED, CWD);
    expect(err).toMatch(/Access denied/);
  });

  it("rejects home directory when not in allowed_paths", () => {
    const err = validatePath("~/secret", ALLOWED, CWD);
    expect(err).toMatch(/Access denied/);
  });
});

describe("validateBashCommand", () => {
  const settings = { allowedCommands: ["jq"], allowedPaths: ALLOWED };

  it("allows a builtin command", () => {
    expect(validateBashCommand("ls -la", settings, CWD)).toBeNull();
  });

  it("allows a user-configured command", () => {
    expect(validateBashCommand("jq '.' data.json", settings, CWD)).toBeNull();
  });

  it("rejects a command not in any allowlist", () => {
    const err = validateBashCommand("curl http://example.com", settings, CWD);
    expect(err).toMatch(/Command not allowed: curl/);
  });

  it("allows a valid piped command where both binaries are allowed", () => {
    expect(validateBashCommand("grep -r foo src/ | wc -l", settings, CWD)).toBeNull();
  });

  it("rejects a piped command where second binary is disallowed", () => {
    const err = validateBashCommand("ls | curl http://...", settings, CWD);
    expect(err).toMatch(/Command not allowed: curl/);
  });

  it("rejects a command with path argument outside allowed dirs", () => {
    const err = validateBashCommand("cat /etc/passwd", settings, CWD);
    expect(err).toMatch(/Access denied/);
  });

  it("passes flags and glob patterns without path validation", () => {
    expect(validateBashCommand("ls -la *.ts", settings, CWD)).toBeNull();
  });

  it("BUILTIN_COMMANDS contains the 9 expected defaults", () => {
    const expected = ["ls", "cat", "grep", "find", "echo", "pwd", "wc", "head", "tail"] as const;
    for (const cmd of expected) {
      expect(BUILTIN_COMMANDS).toContain(cmd);
    }
    expect(BUILTIN_COMMANDS).toHaveLength(9);
  });
});
