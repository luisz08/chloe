/**
 * Format a timestamp as a human-readable session name.
 * Format: "YYYY-MM-DD HH:mm"
 * Example: "2026-04-15 14:30"
 */
export function formatSessionName(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}
