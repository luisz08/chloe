import { existsSync, readFileSync, writeFileSync } from "node:fs";

export function loadRecents(filePath: string): string[] {
  if (!existsSync(filePath)) return [];
  try {
    const parsed = JSON.parse(readFileSync(filePath, "utf8"));
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === "string");
  } catch {
    return [];
  }
}

export function saveRecents(filePath: string, names: string[]): void {
  writeFileSync(filePath, JSON.stringify(names), "utf8");
}

export function addRecent(existing: string[], name: string, limit = 20): string[] {
  const deduped = [name, ...existing.filter((n) => n !== name)];
  return deduped.slice(0, limit);
}
