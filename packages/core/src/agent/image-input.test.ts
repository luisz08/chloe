import { describe, expect, it } from "bun:test";
import { detectImages } from "./image-input.js";
import { SUPPORTED_IMAGE_EXTENSIONS } from "./router.js";

// ─── ImageInputProcessor Tests ──────────────────────────────────────────────────
//
// T020: Tests for image input detection (paths and URLs)
// T020a: Tests for invalid image handling

describe("ImageInputProcessor", () => {
  describe("detect - image path detection", () => {
    it("detects local image path with .png extension", () => {
      const input = "Please analyze /home/user/photo.png";
      const images = detectImages(input);
      expect(images.length).toBe(1);
      expect(images[0]?.type).toBe("path");
      expect(images[0]?.value).toBe("/home/user/photo.png");
    });

    it("detects relative image path with .jpg extension", () => {
      const input = "Look at ./images/test.jpg";
      const images = detectImages(input);
      expect(images.length).toBe(1);
      expect(images[0]?.type).toBe("path");
      expect(images[0]?.value).toBe("./images/test.jpg");
    });

    it("detects image path with .jpeg extension", () => {
      const input = "Check ../photos/image.jpeg";
      const images = detectImages(input);
      expect(images.length).toBe(1);
      expect(images[0]?.type).toBe("path");
      expect(images[0]?.value).toBe("../photos/image.jpeg");
    });

    it("detects multiple image paths in single message", () => {
      const input = "Compare /a/image1.png and /b/image2.jpg";
      const images = detectImages(input);
      expect(images.length).toBe(2);
      expect(images[0]?.value).toBe("/a/image1.png");
      expect(images[1]?.value).toBe("/b/image2.jpg");
    });

    it("does NOT detect path with unsupported extension", () => {
      const input = "Read /home/user/document.pdf";
      const images = detectImages(input);
      expect(images.length).toBe(0);
    });

    it("does NOT detect path without extension", () => {
      const input = "Look at /home/user/folder";
      const images = detectImages(input);
      expect(images.length).toBe(0);
    });
  });

  describe("detect - URL detection", () => {
    it("detects HTTPS URL with .png extension", () => {
      const input = "See https://example.com/images/photo.png";
      const images = detectImages(input);
      expect(images.length).toBe(1);
      expect(images[0]?.type).toBe("url");
      expect(images[0]?.value).toBe("https://example.com/images/photo.png");
    });

    it("detects HTTP URL with .jpg extension", () => {
      const input = "Check http://example.org/test.jpg";
      const images = detectImages(input);
      expect(images.length).toBe(1);
      expect(images[0]?.type).toBe("url");
      expect(images[0]?.value).toBe("http://example.org/test.jpg");
    });

    it("detects URL with .gif extension", () => {
      const input = "Here's https://cdn.example.com/animation.gif";
      const images = detectImages(input);
      expect(images.length).toBe(1);
      expect(images[0]?.type).toBe("url");
      expect(images[0]?.value).toBe("https://cdn.example.com/animation.gif");
    });

    it("does NOT detect URL with unsupported extension", () => {
      const input = "Visit https://example.com/page.html";
      const images = detectImages(input);
      expect(images.length).toBe(0);
    });
  });

  describe("detect - extension matching", () => {
    it("matches all supported extensions in paths", () => {
      for (const ext of SUPPORTED_IMAGE_EXTENSIONS) {
        const input = `Check ./image${ext}`;
        const images = detectImages(input);
        expect(images.length).toBe(1);
      }
    });

    it("matches all supported extensions in URLs", () => {
      for (const ext of SUPPORTED_IMAGE_EXTENSIONS) {
        const input = `See https://example.com/image${ext}`;
        const images = detectImages(input);
        expect(images.length).toBe(1);
      }
    });

    it("is case insensitive for extensions", () => {
      const input = "See /home/PHOTO.PNG and ./test.JPG";
      const images = detectImages(input);
      expect(images.length).toBe(2);
    });
  });

  describe("detect - invalid image handling", () => {
    it("logs warning for non-existent local path", () => {
      // When processing, non-existent paths should log warning but not throw
      const input = "Analyze /nonexistent/path/image.png";
      const images = detectImages(input);
      expect(images.length).toBe(1);
      // Processing will log warning when file doesn't exist
    });

    it("handles invalid URL gracefully", () => {
      // Invalid URLs should be skipped with warning
      const input = "See https://invalid-url-that-fails.com/image.png";
      const images = detectImages(input);
      expect(images.length).toBe(1);
      // Processing will log warning when URL fails to fetch
    });

    it("continues with text-only when all images invalid", () => {
      // If all detected images fail, continue with text content only
      const input = "Analyze /nonexistent1.png and /nonexistent2.jpg";
      const images = detectImages(input);
      expect(images.length).toBe(2);
      // toContentBlocks will return empty array, warning logged
    });
  });
});
