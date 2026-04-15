/**
 * Generate a time-sorted session ID.
 * Format: YYYYMMDDHHmmss-xxxxxxx (14-digit timestamp + 7-char random suffix)
 * Example: 20260415143000-a1b2c3d
 */
export function generateSessionId(): string {
  const timestamp = new Date()
    .toISOString()
    .replace(/[-:TZ]/g, "")
    .slice(0, 14);
  const random = crypto.randomUUID().slice(0, 7);
  return `${timestamp}-${random}`;
}
