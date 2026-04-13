import { spawnSync } from "node:child_process";
import { join } from "node:path";

interface ServeCommandOptions {
  port?: number;
}

export function serveCommand({ port }: ServeCommandOptions): void {
  const apiEntry = join(import.meta.dir, "../../../api/src/index.ts");
  const args = ["run", apiEntry];
  if (port !== undefined) {
    args.push("--port", String(port));
  }
  spawnSync("bun", args, { stdio: "inherit" });
}
