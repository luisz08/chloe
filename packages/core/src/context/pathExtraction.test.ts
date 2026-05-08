import { describe, expect, test } from "bun:test";
import { extractPaths } from "./pathExtraction.js";
import type { ChatMessage } from "./types.js";

function textMsg(text: string): ChatMessage {
  return { role: "user", content: [{ type: "text", text }] };
}

function toolUseMsg(input: unknown): ChatMessage {
  return {
    role: "assistant",
    content: [{ type: "tool_use", id: "id1", name: "bash", input }],
  };
}

function toolResultMsg(content: string): ChatMessage {
  return {
    role: "user",
    content: [{ type: "tool_result", toolUseId: "id1", content }],
  };
}

describe("extractPaths from tool_use input", () => {
  test("extracts 'path' key from tool input", () => {
    const msg = toolUseMsg({ path: "src/agent/loop.ts" });
    expect(extractPaths(msg)).toContain("src/agent/loop.ts");
  });

  test("extracts 'file' key from tool input", () => {
    const msg = toolUseMsg({ file: "packages/core/src/index.ts" });
    expect(extractPaths(msg)).toContain("packages/core/src/index.ts");
  });

  test("extracts 'target' key from tool input", () => {
    const msg = toolUseMsg({ target: "docs/README.md" });
    expect(extractPaths(msg)).toContain("docs/README.md");
  });

  test("extracts 'cwd' key from tool input", () => {
    const msg = toolUseMsg({ cwd: "packages/core" });
    expect(extractPaths(msg)).toContain("packages/core");
  });

  test("ignores non-string values in tool input", () => {
    const msg = toolUseMsg({ path: 42 });
    expect(extractPaths(msg)).toHaveLength(0);
  });

  test("ignores null tool input", () => {
    const msg = toolUseMsg(null);
    expect(extractPaths(msg)).toHaveLength(0);
  });
});

describe("extractPaths from text and tool_result via regex", () => {
  test("extracts repo-relative path from text block", () => {
    const msg = textMsg("I modified packages/core/src/agent/loop.ts today.");
    expect(extractPaths(msg)).toContain("packages/core/src/agent/loop.ts");
  });

  test("extracts path from tool_result content", () => {
    const msg = toolResultMsg("wrote src/context/adapter.ts successfully");
    expect(extractPaths(msg)).toContain("src/context/adapter.ts");
  });

  test("extracts root-level config files by name", () => {
    const msg = textMsg("check package.json and tsconfig.json");
    const paths = extractPaths(msg);
    expect(paths).toContain("package.json");
    expect(paths).toContain("tsconfig.json");
  });

  test("does not extract plain words without path structure", () => {
    const msg = textMsg("hello world foo bar");
    expect(extractPaths(msg)).toHaveLength(0);
  });
});

describe("path normalization and filtering", () => {
  test("drops paths containing '..'", () => {
    const msg = toolUseMsg({ path: "../../../etc/passwd" });
    expect(extractPaths(msg)).toHaveLength(0);
  });

  test("drops absolute paths when workspace is provided", () => {
    const msg = toolUseMsg({ path: "/etc/hosts" });
    expect(extractPaths(msg, "/home/user/project")).toHaveLength(0);
  });

  test("converts absolute path inside workspace to relative", () => {
    const msg = toolUseMsg({ path: "/home/user/project/src/foo.ts" });
    const paths = extractPaths(msg, "/home/user/project");
    expect(paths).toContain("src/foo.ts");
  });

  test("deduplicates repeated paths", () => {
    const msg = textMsg("src/foo.ts and src/foo.ts again");
    const paths = extractPaths(msg);
    expect(paths.filter((p) => p === "src/foo.ts")).toHaveLength(1);
  });
});
