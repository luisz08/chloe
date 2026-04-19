import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { routeCommand } from "./router.js";

function makeTmpDir(): string {
  const dir = join(tmpdir(), `chloe-router-test-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe("routeCommand — passthrough", () => {
  it("returns passthrough for input not starting with /", async () => {
    const result = await routeCommand("hello world", { globalSkillsDir: "", projectSkillsDir: "" });
    expect(result.kind).toBe("passthrough");
  });

  it("returns passthrough for empty string", async () => {
    const result = await routeCommand("", { globalSkillsDir: "", projectSkillsDir: "" });
    expect(result.kind).toBe("passthrough");
  });
});

describe("routeCommand — internal commands", () => {
  let globalDir: string;
  let projectDir: string;

  beforeEach(() => {
    globalDir = makeTmpDir();
    projectDir = makeTmpDir();
  });

  afterEach(() => {
    rmSync(globalDir, { recursive: true, force: true });
    rmSync(projectDir, { recursive: true, force: true });
  });

  it("handles /help with no skills defined", async () => {
    const result = await routeCommand("/help", {
      globalSkillsDir: globalDir,
      projectSkillsDir: projectDir,
    });
    expect(result.kind).toBe("internal");
    if (result.kind === "internal") {
      expect(result.output).toContain("/help");
      expect(result.output).toContain("No skills defined");
    }
  });

  it("/help lists a global skill", async () => {
    writeFileSync(join(globalDir, "greet.md"), "Hello");
    const result = await routeCommand("/help", {
      globalSkillsDir: globalDir,
      projectSkillsDir: projectDir,
    });
    expect(result.kind).toBe("internal");
    if (result.kind === "internal") {
      expect(result.output).toContain("/greet");
      expect(result.output).toContain("global");
    }
  });

  it("/help lists a project skill", async () => {
    writeFileSync(join(projectDir, "deploy.md"), "Deploy");
    const result = await routeCommand("/help", {
      globalSkillsDir: globalDir,
      projectSkillsDir: projectDir,
    });
    expect(result.kind).toBe("internal");
    if (result.kind === "internal") {
      expect(result.output).toContain("/deploy");
      expect(result.output).toContain("project");
    }
  });

  it("/help marks overridden global skills", async () => {
    writeFileSync(join(globalDir, "greet.md"), "Global");
    writeFileSync(join(projectDir, "greet.md"), "Project");
    const result = await routeCommand("/help", {
      globalSkillsDir: globalDir,
      projectSkillsDir: projectDir,
    });
    expect(result.kind).toBe("internal");
    if (result.kind === "internal") {
      expect(result.output).toContain("overrides global");
    }
  });
});

describe("routeCommand — skill expansion", () => {
  let globalDir: string;
  let projectDir: string;

  beforeEach(() => {
    globalDir = makeTmpDir();
    projectDir = makeTmpDir();
  });

  afterEach(() => {
    rmSync(globalDir, { recursive: true, force: true });
    rmSync(projectDir, { recursive: true, force: true });
  });

  it("expands skill with $ARGUMENTS substituted", async () => {
    writeFileSync(join(globalDir, "greet.md"), "Hello $ARGUMENTS");
    const result = await routeCommand("/greet world", {
      globalSkillsDir: globalDir,
      projectSkillsDir: projectDir,
    });
    expect(result.kind).toBe("skill");
    if (result.kind === "skill") {
      expect(result.expandedContent).toBe("Hello world");
    }
  });

  it("sends skill content verbatim when no $ARGUMENTS and no args given", async () => {
    writeFileSync(join(globalDir, "deploy.md"), "Deploy now");
    const result = await routeCommand("/deploy", {
      globalSkillsDir: globalDir,
      projectSkillsDir: projectDir,
    });
    expect(result.kind).toBe("skill");
    if (result.kind === "skill") {
      expect(result.expandedContent).toBe("Deploy now");
    }
  });

  it("project skill takes precedence over global skill", async () => {
    writeFileSync(join(globalDir, "greet.md"), "Global greet $ARGUMENTS");
    writeFileSync(join(projectDir, "greet.md"), "Project greet $ARGUMENTS");
    const result = await routeCommand("/greet world", {
      globalSkillsDir: globalDir,
      projectSkillsDir: projectDir,
    });
    expect(result.kind).toBe("skill");
    if (result.kind === "skill") {
      expect(result.expandedContent).toBe("Project greet world");
    }
  });

  it("returns error for empty skill file", async () => {
    writeFileSync(join(globalDir, "empty.md"), "");
    const result = await routeCommand("/empty", {
      globalSkillsDir: globalDir,
      projectSkillsDir: projectDir,
    });
    expect(result.kind).toBe("error");
    if (result.kind === "error") {
      expect(result.message).toContain("empty");
    }
  });

  it("lookup is case-insensitive — /Greet resolves to greet.md", async () => {
    writeFileSync(join(globalDir, "greet.md"), "Hello $ARGUMENTS");
    const result = await routeCommand("/Greet world", {
      globalSkillsDir: globalDir,
      projectSkillsDir: projectDir,
    });
    expect(result.kind).toBe("skill");
  });
});

describe("routeCommand — unknown command", () => {
  let globalDir: string;
  let projectDir: string;

  beforeEach(() => {
    globalDir = makeTmpDir();
    projectDir = makeTmpDir();
  });

  afterEach(() => {
    rmSync(globalDir, { recursive: true, force: true });
    rmSync(projectDir, { recursive: true, force: true });
  });

  it("returns error for unknown command", async () => {
    const result = await routeCommand("/nonexistent", {
      globalSkillsDir: globalDir,
      projectSkillsDir: projectDir,
    });
    expect(result.kind).toBe("error");
    if (result.kind === "error") {
      expect(result.message).toBe("Unknown command: /nonexistent");
    }
  });

  it("returns error for bare slash", async () => {
    const result = await routeCommand("/", {
      globalSkillsDir: globalDir,
      projectSkillsDir: projectDir,
    });
    expect(result.kind).toBe("error");
    if (result.kind === "error") {
      expect(result.message).toContain("Unknown command");
    }
  });
});
