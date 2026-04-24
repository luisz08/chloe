export const SkillSource = {
  Global: "global",
  Project: "project",
  Plugin: "plugin",
} as const;
export type SkillSource = (typeof SkillSource)[keyof typeof SkillSource];

export interface Skill {
  name: string;
  content: string;
  source: SkillSource;
  description: string;
}

export type CommandResult =
  | { kind: "skill"; expandedContent: string }
  | { kind: "internal"; output: string }
  | { kind: "reload-skills" }
  | { kind: "error"; message: string }
  | { kind: "passthrough" };
