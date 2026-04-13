const MAX_LENGTH = 64;

/**
 * Convert a string to a URL-safe slug.
 * Returns null if the result is empty or exceeds 64 characters.
 */
export function slugify(input: string): string | null {
  const result = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (result.length === 0 || result.length > MAX_LENGTH) {
    return null;
  }
  return result;
}

/**
 * Validate a session ID.
 * Must match /^[a-z0-9][a-z0-9-]*[a-z0-9]$/ or be a single alphanumeric char.
 * Max length 64.
 */
export function validateSessionId(id: string): boolean {
  if (id.length === 0 || id.length > MAX_LENGTH) {
    return false;
  }
  if (id.length === 1) {
    return /^[a-z0-9]$/.test(id);
  }
  return /^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(id);
}
