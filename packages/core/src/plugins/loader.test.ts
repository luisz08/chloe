import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mergePluginSkills } from "../skills/loader.js";
import type { Skill } from "../skills/types.js";
import { discoverSkills, loadHooks } from "./loader.js";
import type { PluginSkill } from "./types.js";

function makeTmpDir(): string {
  const dir = join(tmpdir(), `chloe-loader-test-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe("discoverSkills", () => {
  let dir: string;

  beforeEach(() => {
    dir = makeTmpDir();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("discovers skills from skills/<name>/SKILL.md", () => {
    mkdirSync(join(dir, "skills", "greet"), { recursive: true });
    writeFileSync(join(dir, "skills", "greet", "SKILL.md"), "# Greet\nSay hello");
    const skills = discoverSkills(dir, "test@mkt");
    expect(skills).toHaveLength(1);
    expect(skills[0]?.name).toBe("greet");
    expect(skills[0]?.source).toBe("plugin");
    expect(skills[0]?.pluginId).toBe("test@mkt");
  });

  it("discovers skills from commands/<name>/SKILL.md", () => {
    mkdirSync(join(dir, "commands", "fmt"), { recursive: true });
    writeFileSync(join(dir, "commands", "fmt", "SKILL.md"), "Format code");
    const skills = discoverSkills(dir, "test@mkt");
    expect(skills).toHaveLength(1);
    expect(skills[0]?.name).toBe("fmt");
  });

  it("discovers both skill forms simultaneously", () => {
    mkdirSync(join(dir, "skills", "greet"), { recursive: true });
    writeFileSync(join(dir, "skills", "greet", "SKILL.md"), "Greet");
    mkdirSync(join(dir, "commands", "fmt"), { recursive: true });
    writeFileSync(join(dir, "commands", "fmt", "SKILL.md"), "Format");
    const skills = discoverSkills(dir, "test@mkt");
    expect(skills).toHaveLength(2);
  });

  it("returns empty when no skills or commands dirs", () => {
    expect(discoverSkills(dir, "test@mkt")).toHaveLength(0);
  });
});

describe("loadHooks", () => {
  let dir: string;

  beforeEach(() => {
    dir = makeTmpDir();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("returns [] when hooks.json is missing", () => {
    expect(loadHooks(dir, "test@mkt")).toHaveLength(0);
  });

  it("parses hooks.json and flattens into HookEntry[]", () => {
    mkdirSync(join(dir, "hooks"), { recursive: true });
    writeFileSync(
      join(dir, "hooks", "hooks.json"),
      JSON.stringify({
        hooks: {
          PostToolUse: [
            {
              matcher: "write_file",
              hooks: [{ type: "command", command: "./format.sh" }],
            },
          ],
          SessionStart: [
            {
              hooks: [{ type: "command", command: "./setup.sh" }],
            },
          ],
        },
      }),
    );
    const hooks = loadHooks(dir, "test@mkt");
    expect(hooks).toHaveLength(2);

    const postHook = hooks.find((h) => h.event === "PostToolUse");
    expect(postHook?.matcher).toBe("write_file");
    expect(postHook?.command).toBe("./format.sh");
    expect(postHook?.pluginId).toBe("test@mkt");

    const sessionHook = hooks.find((h) => h.event === "SessionStart");
    expect(sessionHook?.matcher).toBeUndefined();
    expect(sessionHook?.command).toBe("./setup.sh");
  });
});

describe("mergePluginSkills", () => {
  function makeSkill(name: string, source: "global" | "project"): Skill {
    return { name, content: `${source} content`, source, description: source };
  }

  function makePluginSkill(name: string): PluginSkill {
    return {
      name,
      content: "plugin content",
      source: "plugin",
      description: "plugin",
      pluginId: "test@mkt",
    };
  }

  it("plugin skills are lowest priority — global wins on collision", () => {
    const existing = [makeSkill("greet", "global")];
    const plugin = [makePluginSkill("greet")];
    const merged = mergePluginSkills(existing, plugin);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.source).toBe("global");
  });

  it("project wins over plugin on collision", () => {
    const existing = [makeSkill("greet", "project")];
    const plugin = [makePluginSkill("greet")];
    const merged = mergePluginSkills(existing, plugin);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.source).toBe("project");
  });

  it("non-colliding plugin skills are added", () => {
    const existing = [makeSkill("greet", "global")];
    const plugin = [makePluginSkill("format")];
    const merged = mergePluginSkills(existing, plugin);
    expect(merged).toHaveLength(2);
    const pluginSkill = merged.find((s) => s.name === "format");
    expect(pluginSkill?.source).toBe("plugin");
  });

  it("returns empty when both inputs are empty", () => {
    expect(mergePluginSkills([], [])).toHaveLength(0);
  });
});
