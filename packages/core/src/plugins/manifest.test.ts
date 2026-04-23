import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  readMarketplaceManifest,
  readPluginManifest,
  validateMarketplaceManifest,
} from "./manifest.js";

function makeTmpDir(): string {
  const dir = join(tmpdir(), `chloe-manifest-test-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe("readPluginManifest", () => {
  let dir: string;

  beforeEach(() => {
    dir = makeTmpDir();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("returns directory name as fallback when plugin.json is missing", () => {
    const manifest = readPluginManifest(dir);
    const parts = dir.split("/");
    const dirName = parts[parts.length - 1] ?? "";
    expect(manifest.name).toBe(dirName);
    expect(manifest.version).toBeUndefined();
  });

  it("parses a valid plugin.json", () => {
    mkdirSync(join(dir, ".chloe-plugin"), { recursive: true });
    writeFileSync(
      join(dir, ".chloe-plugin", "plugin.json"),
      JSON.stringify({ name: "myplugin", version: "1.0.0" }),
    );
    const manifest = readPluginManifest(dir);
    expect(manifest.name).toBe("myplugin");
    expect(manifest.version).toBe("1.0.0");
  });

  it("throws with file path on invalid JSON", () => {
    mkdirSync(join(dir, ".chloe-plugin"), { recursive: true });
    writeFileSync(join(dir, ".chloe-plugin", "plugin.json"), "{ bad json");
    expect(() => readPluginManifest(dir)).toThrow(/plugin\.json/);
  });
});

describe("readMarketplaceManifest", () => {
  let dir: string;

  beforeEach(() => {
    dir = makeTmpDir();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("throws with file path when marketplace.json is missing", () => {
    expect(() => readMarketplaceManifest(dir)).toThrow(/marketplace\.json/);
  });

  it("throws with file path on invalid JSON", () => {
    mkdirSync(join(dir, ".chloe-plugin"), { recursive: true });
    writeFileSync(join(dir, ".chloe-plugin", "marketplace.json"), "{ bad");
    expect(() => readMarketplaceManifest(dir)).toThrow(/marketplace\.json/);
  });

  it("parses a valid marketplace.json", () => {
    mkdirSync(join(dir, ".chloe-plugin"), { recursive: true });
    writeFileSync(
      join(dir, ".chloe-plugin", "marketplace.json"),
      JSON.stringify({
        name: "my-marketplace",
        owner: { name: "alice" },
        plugins: [],
      }),
    );
    const manifest = readMarketplaceManifest(dir);
    expect(manifest.name).toBe("my-marketplace");
    expect(manifest.plugins).toHaveLength(0);
  });
});

describe("validateMarketplaceManifest", () => {
  it("throws for missing name", () => {
    expect(() =>
      validateMarketplaceManifest({ owner: { name: "x" }, plugins: [] }, "test.json"),
    ).toThrow(/"name"/);
  });

  it("throws for missing owner", () => {
    expect(() => validateMarketplaceManifest({ name: "x", plugins: [] }, "test.json")).toThrow(
      /"owner"/,
    );
  });

  it("throws for missing plugins", () => {
    expect(() =>
      validateMarketplaceManifest({ name: "x", owner: { name: "y" } }, "test.json"),
    ).toThrow(/"plugins"/);
  });

  it("passes for valid manifest", () => {
    expect(() =>
      validateMarketplaceManifest({ name: "x", owner: { name: "y" }, plugins: [] }, "test.json"),
    ).not.toThrow();
  });
});
