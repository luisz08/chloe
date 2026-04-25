import { describe, expect, it } from "bun:test";
import { getSearchProvider } from "./index.js";
import { BraveProvider } from "./providers/brave.js";
import { DuckDuckGoProvider } from "./providers/duckduckgo.js";

describe("getSearchProvider", () => {
  it("returns DuckDuckGoProvider for provider='duckduckgo'", () => {
    const provider = getSearchProvider({ provider: "duckduckgo" });
    expect(provider).toBeInstanceOf(DuckDuckGoProvider);
  });

  it("returns BraveProvider for provider='brave'", () => {
    const provider = getSearchProvider({ provider: "brave" });
    expect(provider).toBeInstanceOf(BraveProvider);
  });

  it("falls back to DuckDuckGoProvider for unknown provider", () => {
    const provider = getSearchProvider({ provider: "unknown-provider" });
    expect(provider).toBeInstanceOf(DuckDuckGoProvider);
  });
});
