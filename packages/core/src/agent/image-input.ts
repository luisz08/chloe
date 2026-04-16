/**
 * Image input detection and processing for multi-model routing.
 *
 * Detects image paths and URLs in user messages, converts to content blocks
 * for the Anthropic API.
 */

import { existsSync, readFileSync } from "node:fs";
import { getLogger } from "../logger/index.js";
import { SUPPORTED_IMAGE_EXTENSIONS } from "./router.js";
import type { ImageInput } from "./types.js";

const log = getLogger("image-input");

// ─── Detection ──────────────────────────────────────────────────────────────────

/**
 * Build regex pattern for supported image extensions.
 */
function buildExtensionPattern(): string {
  return SUPPORTED_IMAGE_EXTENSIONS.join("|").replace(/\./g, "\\.");
}

/**
 * Detect image paths and URLs in text.
 * Returns array of detected image inputs with type and value.
 */
export function detectImages(text: string): ImageInput[] {
  const extPattern = buildExtensionPattern();

  // Combined regex: URLs OR paths ending with image extension
  // URL pattern: https?://[non-space chars]+[extension]
  // Path pattern: (./ | / | ../ )[non-space chars]+[extension]
  const combinedRegex = new RegExp(
    `(https?:\\/\\/[^\\s]+?(?:${extPattern}))|(?:\\.\\/|\\/|\\.\\.\\/)[^\\s]+?(?:${extPattern})`,
    "gi",
  );

  const images: ImageInput[] = [];
  const seen = new Set<string>();

  // Use exec with explicit loop to avoid assignment in expression
  let lastIndex = 0;
  while (lastIndex < text.length) {
    const match = combinedRegex.exec(text);
    if (match === null) break;

    lastIndex = combinedRegex.lastIndex;
    const value = match[0];

    // Skip if already seen (deduplicate)
    if (seen.has(value)) {
      continue;
    }

    // Determine type: URL if it starts with http:// or https://
    const isUrl = value.startsWith("http://") || value.startsWith("https://");

    images.push({
      type: isUrl ? "url" : "path",
      value,
    });
    seen.add(value);
  }

  return images;
}

// ─── Processing ─────────────────────────────────────────────────────────────────

/**
 * Supported media types for Anthropic image blocks.
 */
type SupportedMediaType = "image/png" | "image/jpeg" | "image/gif" | "image/webp";

/**
 * Media type mapping for image extensions.
 */
const MEDIA_TYPE_MAP: Record<string, SupportedMediaType> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".bmp": "image/png", // bmp not supported, fallback to png
};

/**
 * Get media type from file extension.
 */
function getMediaType(path: string): SupportedMediaType {
  const ext = path.toLowerCase().slice(path.lastIndexOf("."));
  return MEDIA_TYPE_MAP[ext] ?? "image/png";
}

/**
 * Anthropic image content block types.
 */
export type ImageContentBlock = {
  type: "image";
  source:
    | { type: "base64"; media_type: SupportedMediaType; data: string }
    | { type: "url"; media_type: SupportedMediaType; url: string };
};

/**
 * Convert image inputs to Anthropic content blocks.
 *
 * For local paths: reads file and encodes as base64
 * For URLs: passes URL directly (Anthropic fetches)
 *
 * Logs warnings for invalid/unreadable images, returns empty array if all fail.
 */
export async function toContentBlocks(images: ImageInput[]): Promise<ImageContentBlock[]> {
  const blocks: ImageContentBlock[] = [];

  for (const image of images) {
    try {
      if (image.type === "path") {
        // Local file - check existence and read
        if (!existsSync(image.value)) {
          log.warn("image path does not exist", { path: image.value });
          continue;
        }

        const mediaType = getMediaType(image.value);
        const data = readFileSync(image.value).toString("base64");

        blocks.push({
          type: "image",
          source: {
            type: "base64",
            media_type: mediaType,
            data,
          },
        });

        log.debug("image loaded", { path: image.value, mediaType });
      } else {
        // URL - pass directly to Anthropic
        const mediaType = getMediaType(image.value);

        blocks.push({
          type: "image",
          source: {
            type: "url",
            media_type: mediaType,
            url: image.value,
          },
        });

        log.debug("image URL added", { url: image.value, mediaType });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.warn("failed to process image", { image: image.value, error: message });
    }
  }

  return blocks;
}
