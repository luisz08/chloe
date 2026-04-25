import { describe, expect, it } from "bun:test";
import { getSearchProvider } from "./index.js";
import { BraveProvider } from "./providers/brave.js";
import { DuckDuckGoProvider } from "./providers/duckduckgo.js";

describe("getSearchProvider", () => {
  it("returns DuckDuckGoProvider for provider='duckduckgo'", () => {
    const provider = getSearchProvider({ provider: "duckduckgo" });
    expect(provider).toBeInstanceOf(DuckDuckGoProvider);
  });

  it("returns BraveProvider for provider='brave' with API key", () => {
    const provider = getSearchProvider({ provider: "brave", braveApiKey: "test-key" });
    expect(provider).toBeInstanceOf(BraveProvider);
  });

  it("throws when provider='brave' but no API key is set", () => {
    expect(() => getSearchProvider({ provider: "brave" })).toThrow("brave_api_key");
  });

  it("falls back to DuckDuckGoProvider for unknown provider", () => {
    const provider = getSearchProvider({ provider: "unknown-provider" });
    expect(provider).toBeInstanceOf(DuckDuckGoProvider);
  });
});
