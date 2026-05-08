export function buildSummarySystem(summary: string, workingSetPaths: string[]): string {
  const pathLines =
    workingSetPaths.length > 0
      ? workingSetPaths.map((p) => `- \`${p}\``).join("\n")
      : "- (none recorded)";

  return [
    "## Context Summary (Auto-Generated)",
    "",
    summary.trim(),
    "",
    "---",
    "",
    "## Active Files",
    "",
    pathLines,
    "",
    "---",
    "",
    "## Resume Note",
    "",
    "Context was compacted. Use this summary and the remaining messages as the source of truth.",
  ].join("\n");
}

const LEGACY_RE = /^<context_summary>([\s\S]*)<\/context_summary>$/;

export function stripLegacyXmlWrapper(text: string): string {
  const m = text.match(LEGACY_RE);
  return m ? (m[1] ?? text) : text;
}
