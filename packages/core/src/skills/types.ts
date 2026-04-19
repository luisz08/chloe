export type SkillSource = "global" | "project";

export interface Skill {
  name: string;
  content: string;
  source: SkillSource;
}

export type CommandResult =
  | { kind: "skill"; expandedContent: string }
  | { kind: "internal"; output: string }
  | { kind: "error"; message: string }
  | { kind: "passthrough" };
