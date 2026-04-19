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
    writeFileSync(join(globalDir, "greet.md"), "Hello $ARGUMENTS");
    const skills = await loadSkills(globalDir, projectDir);
    expect(skills).toHaveLength(1);
    expect(skills[0]?.name).toBe("greet");
    expect(skills[0]?.content).toBe("Hello $ARGUMENTS");
    expect(skills[0]?.source).toBe("global");
  });

  it("loads a skill from the project directory", async () => {
    writeFileSync(join(projectDir, "deploy.md"), "Deploy $ARGUMENTS");
    const skills = await loadSkills(globalDir, projectDir);
    expect(skills).toHaveLength(1);
    expect(skills[0]?.name).toBe("deploy");
    expect(skills[0]?.source).toBe("project");
  });

  it("loads skills from both directories", async () => {
    writeFileSync(join(globalDir, "greet.md"), "Hello");
    writeFileSync(join(projectDir, "deploy.md"), "Deploy");
    const skills = await loadSkills(globalDir, projectDir);
    expect(skills).toHaveLength(2);
  });

  it("project-level skill overrides global skill with same name", async () => {
    writeFileSync(join(globalDir, "greet.md"), "Global greet");
    writeFileSync(join(projectDir, "greet.md"), "Project greet");
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

  it("ignores files with uppercase letters in name", async () => {
    writeFileSync(join(globalDir, "Greet.md"), "Hello");
    const skills = await loadSkills(globalDir, projectDir);
    expect(skills).toEqual([]);
  });

  it("ignores files that are not .md", async () => {
    writeFileSync(join(globalDir, "greet.txt"), "Hello");
    writeFileSync(join(globalDir, "greet.md"), "Hello md");
    const skills = await loadSkills(globalDir, projectDir);
    expect(skills).toHaveLength(1);
    expect(skills[0]?.name).toBe("greet");
  });

  it("ignores files with spaces in name", async () => {
    writeFileSync(join(globalDir, "my skill.md"), "Hello");
    const skills = await loadSkills(globalDir, projectDir);
    expect(skills).toEqual([]);
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
