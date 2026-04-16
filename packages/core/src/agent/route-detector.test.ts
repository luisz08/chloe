import { beforeEach, describe, expect, it } from "bun:test";
import { RouteDetector } from "./route-detector.js";

// ─── Tests ──────────────────────────────────────────────────────────────────────

describe("RouteDetector", () => {
  let detector: RouteDetector;

  beforeEach(() => {
    detector = new RouteDetector();
  });

  describe("detectInStream - token at line start", () => {
    it("detects [REASONING] at buffer start", () => {
      const result = detector.detectInStream("[REASONING]\nLet me think...");
      expect(result.detected).toBe(true);
      expect(result.token).toBe("REASONING");
      expect(result.shouldAbort).toBe(true);
      expect(result.remainingText).toBe("\nLet me think...");
    });

    it("detects [FAST] at buffer start", () => {
      const result = detector.detectInStream("[FAST]\nThe answer is 42.");
      expect(result.detected).toBe(true);
      expect(result.token).toBe("FAST");
      expect(result.shouldAbort).toBe(true);
      expect(result.remainingText).toBe("\nThe answer is 42.");
    });

    it("detects [VISION] at buffer start", () => {
      const result = detector.detectInStream("[VISION]\nLooking at the image...");
      expect(result.detected).toBe(true);
      expect(result.token).toBe("VISION");
      expect(result.shouldAbort).toBe(true);
      expect(result.remainingText).toBe("\nLooking at the image...");
    });

    it("detects token after newline", () => {
      const result = detector.detectInStream("Some text\n[REASONING]\nDeep analysis...");
      expect(result.detected).toBe(true);
      expect(result.token).toBe("REASONING");
      expect(result.shouldAbort).toBe(true);
      expect(result.remainingText).toBe("\nDeep analysis...");
    });
  });

  describe("detectInStream - token NOT at line start", () => {
    it("does NOT detect token in middle of line", () => {
      const result = detector.detectInStream("Here is [REASONING] embedded");
      expect(result.detected).toBe(false);
      expect(result.token).toBe(null);
      expect(result.shouldAbort).toBe(false);
      // Token not at line start, passes through
    });

    it("does NOT detect token after space", () => {
      const result = detector.detectInStream(" [REASONING]\nThink...");
      expect(result.detected).toBe(false);
      expect(result.token).toBe(null);
      expect(result.shouldAbort).toBe(false);
    });

    it("does NOT detect token after other text on same line", () => {
      const result = detector.detectInStream("text[REASONING]\nAnalysis");
      expect(result.detected).toBe(false);
      expect(result.token).toBe(null);
      expect(result.shouldAbort).toBe(false);
    });
  });

  describe("detectInStream - partial token matching", () => {
    it("buffers partial [REAS", () => {
      const result = detector.detectInStream("[REAS");
      expect(result.detected).toBe(false);
      expect(result.token).toBe(null);
      expect(result.shouldAbort).toBe(false);
      // Waiting for more text
    });

    it("completes detection when full token arrives", () => {
      detector.detectInStream("[REAS");
      const result = detector.detectInStream("ONING]\nThink...");
      expect(result.detected).toBe(true);
      expect(result.token).toBe("REASONING");
      expect(result.shouldAbort).toBe(true);
    });

    it("handles partial then different text (no match)", () => {
      detector.detectInStream("[REAS");
      const result = detector.detectInStream("XYZ not a token");
      expect(result.detected).toBe(false);
      expect(result.token).toBe(null);
      expect(result.shouldAbort).toBe(false);
    });
  });

  describe("detectInStream - streaming chunks", () => {
    it("handles multiple chunks before token", () => {
      detector.detectInStream("Hello ");
      detector.detectInStream("world\n");
      const result = detector.detectInStream("[FAST]\nQuick answer.");
      expect(result.detected).toBe(true);
      expect(result.token).toBe("FAST");
      expect(result.shouldAbort).toBe(true);
    });

    it("token split across chunks", () => {
      detector.detectInStream("[REAS");
      detector.detectInStream("ON");
      const result = detector.detectInStream("ING]\nDeep thought");
      expect(result.detected).toBe(true);
      expect(result.token).toBe("REASONING");
      expect(result.shouldAbort).toBe(true);
    });
  });

  describe("reset", () => {
    it("clears buffer and state", () => {
      detector.detectInStream("[REAS");
      detector.reset();
      const state = detector.getState();
      expect(state.buffer).toBe("");
      expect(state.lineStart).toBe(true);
      expect(state.detected).toBe(false);
    });

    it("allows fresh detection after reset", () => {
      detector.detectInStream("[REAS");
      detector.reset();
      const result = detector.detectInStream("[FAST]\nQuick.");
      expect(result.detected).toBe(true);
      expect(result.token).toBe("FAST");
    });
  });

  describe("edge cases", () => {
    it("handles empty string", () => {
      const result = detector.detectInStream("");
      expect(result.detected).toBe(false);
      expect(result.token).toBe(null);
      expect(result.shouldAbort).toBe(false);
    });

    it("handles multiple newlines before token", () => {
      const result = detector.detectInStream("\n\n\n[REASONING]\nAnalysis");
      expect(result.detected).toBe(true);
      expect(result.token).toBe("REASONING");
      expect(result.shouldAbort).toBe(true);
    });

    it("handles token without trailing newline", () => {
      const result = detector.detectInStream("[REASONING]Analysis starts");
      expect(result.detected).toBe(true);
      expect(result.token).toBe("REASONING");
      expect(result.shouldAbort).toBe(true);
      expect(result.remainingText).toBe("Analysis starts");
    });

    it("does not detect already consumed token", () => {
      // First detection
      detector.detectInStream("[REASONING]\nThink...");
      detector.reset();
      // Token already consumed, should detect new text only
      const result = detector.detectInStream("Continuing...");
      expect(result.detected).toBe(false);
    });
  });
});
