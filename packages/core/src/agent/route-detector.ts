/**
 * Route token detection for multi-model routing.
 *
 * Detects route tokens ([REASONING], [FAST], [VISION]) at LINE START during streaming.
 * Tokens must appear at the beginning of a line (after newline or at buffer start).
 */

import { ROUTE_TOKENS } from "./router.js";
import type { RouteDetectionResult, RouteTokenType } from "./types.js";

interface DetectionState {
  buffer: string;
  lineStart: boolean;
  detected: boolean;
}

/**
 * RouteDetector detects route tokens at line start during streaming.
 *
 * Key behaviors:
 * 1. Token must be at line start (after newline or at buffer start)
 * 2. Partial token matches are buffered for detection
 * 3. Non-matching text is passed through as remainingText
 * 4. shouldAbort flag indicates stream should be aborted for model switch
 */
export class RouteDetector {
  private state: DetectionState = {
    buffer: "",
    lineStart: true,
    detected: false,
  };

  /**
   * Reset detection state for a new request.
   */
  reset(): void {
    this.state = {
      buffer: "",
      lineStart: true,
      detected: false,
    };
  }

  /**
   * Process incoming stream text and detect route tokens at line start.
   * Returns detection result with shouldAbort flag and remaining text.
   */
  detectInStream(text: string): RouteDetectionResult {
    this.state.buffer += text;

    // Check for route token at line start
    const result = this.checkLineStart();

    if (result.detected) {
      this.state.detected = true;
      return result;
    }

    // No token detected, pass through text
    return {
      detected: false,
      token: null,
      shouldAbort: false,
      remainingText: text,
    };
  }

  /**
   * Check if a route token appears at line start in the buffer.
   * Returns detection result with token type and remaining text after token.
   */
  checkLineStart(): RouteDetectionResult {
    const buffer = this.state.buffer;

    // A token is "at line start" if it appears:
    // 1. At position 0 (buffer start)
    // 2. Immediately after a newline character

    // Check each route token
    for (const [tokenType, token] of Object.entries(ROUTE_TOKENS) as [RouteTokenType, string][]) {
      // Check at buffer start (position 0)
      if (buffer.startsWith(token)) {
        // Token detected at buffer start
        const remainingText = buffer.slice(token.length);
        return {
          detected: true,
          token: tokenType,
          shouldAbort: true,
          remainingText,
        };
      }

      // Check after each newline in the buffer
      let searchPos = 0;
      while (searchPos < buffer.length) {
        const newlinePos = buffer.indexOf("\n", searchPos);
        if (newlinePos === -1) break;

        const afterNewlinePos = newlinePos + 1;
        if (buffer.slice(afterNewlinePos).startsWith(token)) {
          // Token detected after newline
          const remainingText = buffer.slice(afterNewlinePos + token.length);
          return {
            detected: true,
            token: tokenType,
            shouldAbort: true,
            remainingText,
          };
        }
        searchPos = newlinePos + 1;
      }

      // Check for partial match at buffer start
      if (token.startsWith(buffer) && buffer.length > 0 && buffer.length < token.length) {
        // Partial match at buffer start - wait for more text
        return {
          detected: false,
          token: null,
          shouldAbort: false,
          remainingText: "",
        };
      }

      // Check for partial match after newline
      searchPos = 0;
      while (searchPos < buffer.length) {
        const newlinePos = buffer.indexOf("\n", searchPos);
        if (newlinePos === -1) break;

        const afterNewlinePos = newlinePos + 1;
        const textAfterNewline = buffer.slice(afterNewlinePos);
        if (
          token.startsWith(textAfterNewline) &&
          textAfterNewline.length > 0 &&
          textAfterNewline.length < token.length
        ) {
          // Partial match after newline - wait for more text
          return {
            detected: false,
            token: null,
            shouldAbort: false,
            remainingText: "",
          };
        }
        searchPos = newlinePos + 1;
      }
    }

    // No token or partial match at line start
    // Update lineStart flag based on buffer content
    this.state.lineStart = buffer.endsWith("\n");

    return {
      detected: false,
      token: null,
      shouldAbort: false,
      remainingText: buffer,
    };
  }

  /**
   * Get current detection state for testing/debugging.
   */
  getState(): DetectionState {
    return { ...this.state };
  }
}
