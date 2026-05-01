import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expandArguments, loadSkills } from "./loader.js";

function makeTmpDir(): string {
  const dir = join(tmpdir(), `chloe-skill-test-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function writeSkill(dir: string, name: string, content: string) {
  mkdirSync(join(dir, name), { recursive: true });
  writeFileSync(join(dir, name, "SKILL.md"), content);
}

describe("loadSkills", () => {
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

  it("loads a skill from the global directory", async () => {
    writeSkill(globalDir, "greet", "Hello $ARGUMENTS");
    const skills = await loadSkills(globalDir, projectDir);
    expect(skills).toHaveLength(1);
    expect(skills[0]?.name).toBe("greet");
    expect(skills[0]?.content).toBe("Hello $ARGUMENTS");
    expect(skills[0]?.source).toBe("global");
  });

  it("loads a skill from the project directory", async () => {
    writeSkill(projectDir, "deploy", "Deploy $ARGUMENTS");
    const skills = await loadSkills(globalDir, projectDir);
    expect(skills).toHaveLength(1);
    expect(skills[0]?.name).toBe("deploy");
    expect(skills[0]?.source).toBe("project");
  });

  it("loads skills from both directories", async () => {
    writeSkill(globalDir, "greet", "Hello");
    writeSkill(projectDir, "deploy", "Deploy");
    const skills = await loadSkills(globalDir, projectDir);
    expect(skills).toHaveLength(2);
  });

  it("project-level skill overrides global skill with same name", async () => {
    writeSkill(globalDir, "greet", "Global greet");
    writeSkill(projectDir, "greet", "Project greet");
    const skills = await loadSkills(globalDir, projectDir);
    expect(skills).toHaveLength(1);
    expect(skills[0]?.content).toBe("Project greet");
    expect(skills[0]?.source).toBe("project");
  });

  it("silently skips a missing global directory", async () => {
    const missing = join(tmpdir(), "nonexistent-dir-abc123");
    const skills = await loadSkills(missing, projectDir);
    expect(skills).toEqual([]);
  });

  it("silently skips a missing project directory", async () => {
    const missing = join(tmpdir(), "nonexistent-dir-abc123");
    const skills = await loadSkills(globalDir, missing);
    expect(skills).toEqual([]);
  });

  it("ignores directories with uppercase letters in name", async () => {
    mkdirSync(join(globalDir, "Greet"), { recursive: true });
    writeFileSync(join(globalDir, "Greet", "SKILL.md"), "Hello");
    const skills = await loadSkills(globalDir, projectDir);
    expect(skills).toEqual([]);
  });

  it("ignores entries that are not directories with SKILL.md", async () => {
    writeFileSync(join(globalDir, "greet.md"), "Hello flat file");
    writeSkill(globalDir, "greet", "Hello proper");
    const skills = await loadSkills(globalDir, projectDir);
    expect(skills).toHaveLength(1);
    expect(skills[0]?.name).toBe("greet");
  });

  it("ignores directories with spaces in name", async () => {
    mkdirSync(join(globalDir, "my skill"), { recursive: true });
    writeFileSync(join(globalDir, "my skill", "SKILL.md"), "Hello");
    const skills = await loadSkills(globalDir, projectDir);
    expect(skills).toEqual([]);
  });
});

describe("loadSkills — description extraction", () => {
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

  it("extracts description from frontmatter", async () => {
    writeSkill(globalDir, "greet", "---\ndescription: Say hello\n---\nHello $ARGUMENTS");
    const skills = await loadSkills(globalDir, projectDir);
    expect(skills[0]?.description).toBe("Say hello");
  });

  it("falls back to first non-empty non-separator line when no frontmatter", async () => {
    writeSkill(globalDir, "deploy", "Deploy the app now");
    const skills = await loadSkills(globalDir, projectDir);
    expect(skills[0]?.description).toBe("Deploy the app now");
  });

  it("skips --- separator lines when no frontmatter description field", async () => {
    writeSkill(globalDir, "deploy", "---\ntitle: foo\n---\nDeploy now");
    const skills = await loadSkills(globalDir, projectDir);
    expect(skills[0]?.description).toBe("Deploy now");
  });

  it("returns (no description) for empty skill file", async () => {
    writeSkill(globalDir, "empty", "   ");
    const skills = await loadSkills(globalDir, projectDir);
    expect(skills[0]?.description).toBe("(no description)");
  });
});

describe("expandArguments", () => {
  it("replaces $ARGUMENTS with the provided string", () => {
    expect(expandArguments("Hello $ARGUMENTS", "world")).toBe("Hello world");
  });

  it("replaces all occurrences of $ARGUMENTS", () => {
    expect(expandArguments("$ARGUMENTS and $ARGUMENTS", "foo")).toBe("foo and foo");
  });

  it("returns content unchanged when no $ARGUMENTS placeholder", () => {
    expect(expandArguments("Hello world", "ignored")).toBe("Hello world");
  });

  it("replaces $ARGUMENTS with empty string when args is empty", () => {
    expect(expandArguments("Hello $ARGUMENTS!", "")).toBe("Hello !");
  });

  it("trims the args string", () => {
    expect(expandArguments("Hello $ARGUMENTS", "  world  ")).toBe("Hello world");
  });
});
