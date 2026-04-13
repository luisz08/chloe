import { describe, expect, it } from "bun:test";
import { EchoTool } from "./echo.js";

describe("EchoTool", () => {
  it('returns the message unchanged for "hello"', async () => {
    const result = await EchoTool.execute({ message: "hello" });
    expect(result).toBe("hello");
  });

  it("returns empty string when message is empty", async () => {
    const result = await EchoTool.execute({ message: "" });
    expect(result).toBe("");
  });
});
