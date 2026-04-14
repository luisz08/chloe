import { validateBashCommand } from "./sandbox.js";
import type { ToolSettings } from "./settings.js";
import type { Tool } from "./types.js";

interface BashInput {
  command: string;
}

export function createBashTool(settings: ToolSettings, cwd: string): Tool {
  return {
    name: "bash",
    description:
      "Run a shell command in the working directory via `bash -c`. " +
      "Default allowed commands: ls, cat, grep, find, echo, pwd, wc, head, tail " +
      "(plus any commands configured in .chloe/settings.json). " +
      "Supports pipes (|), redirects, and glob patterns. " +
      "Output (stdout + stderr combined) is capped at 32 KB. " +
      "Non-zero exit codes are appended as `[exit code: N]`. " +
      "Prefer `read_file` for reading single files — use `bash` when you need " +
      "shell features like globbing, piping, or counting.",
    inputSchema: {
      type: "object",
      properties: {
        command: {
          type: "string",
          description:
            "Shell command to execute. All binary names in the command (including each " +
            "side of a pipe) must be in the allowed commands list.",
        },
      },
      required: ["command"],
    },
    async execute(input: unknown): Promise<string> {
      const { command } = input as BashInput;

      const sandboxErr = validateBashCommand(
        command,
        { allowedCommands: settings.bash.allowedCommands, allowedPaths: settings.allowedPaths },
        cwd,
      );
      if (sandboxErr !== null) return sandboxErr;

      return new Promise<string>((resolve) => {
        const proc = Bun.spawn(["bash", "-c", command], {
          cwd,
          stdout: "pipe",
          stderr: "pipe",
        });

        let timedOut = false;
        const timer = setTimeout(() => {
          timedOut = true;
          proc.kill();
        }, settings.bash.timeoutMs);

        Promise.all([
          new Response(proc.stdout).text(),
          new Response(proc.stderr).text(),
          proc.exited,
        ])
          .then(([stdout, stderr, exitCode]) => {
            clearTimeout(timer);

            if (timedOut) {
              resolve(`Command timed out after ${settings.bash.timeoutMs / 1000}s`);
              return;
            }

            const combined = stdout + stderr;
            let output: string;
            if (combined.length > settings.bash.maxOutputBytes) {
              const truncated = combined.slice(0, settings.bash.maxOutputBytes);
              const omitted = combined.length - settings.bash.maxOutputBytes;
              output = `${truncated}\n[output truncated: ${omitted} bytes omitted]`;
            } else {
              output = combined;
            }
            if (exitCode !== 0 && !timedOut) {
              output = `${output.trimEnd()}\n[exit code: ${exitCode}]`;
            }
            resolve(output);
          })
          .catch((err: unknown) => {
            clearTimeout(timer);
            if (timedOut) {
              resolve(`Command timed out after ${settings.bash.timeoutMs / 1000}s`);
            } else {
              const msg = err instanceof Error ? err.message : String(err);
              resolve(`Command error: ${msg}`);
            }
          });
      });
    },
  };
}
