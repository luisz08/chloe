const DEFAULT_TIMEOUT_MS = 30_000;

export function normalizeGitHubRepo(input: string): string {
  let s = input.trim();
  // Strip protocol
  s = s.replace(/^https?:\/\//, "");
  // Strip leading github.com/
  s = s.replace(/^github\.com\//, "");
  // Strip trailing .git
  s = s.replace(/\.git$/, "");
  return s;
}

export function buildGitHubUrl(repo: string): string {
  return `https://github.com/${repo}.git`;
}

export async function gitClone(
  url: string,
  dest: string,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<void> {
  const proc = Bun.spawn(["git", "clone", "--", url, dest], {
    stdout: "pipe",
    stderr: "pipe",
  });

  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    proc.kill();
  }, timeoutMs);

  const [, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  clearTimeout(timer);

  if (timedOut) {
    throw new Error(`git clone timed out after ${timeoutMs / 1000}s: ${url}`);
  }
  if (exitCode !== 0) {
    throw new Error(`git clone failed: ${stderr.trim()}`);
  }
}

export async function gitPull(dir: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<void> {
  const proc = Bun.spawn(["git", "pull"], {
    cwd: dir,
    stdout: "pipe",
    stderr: "pipe",
  });

  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    proc.kill();
  }, timeoutMs);

  const [, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  clearTimeout(timer);

  if (timedOut) {
    throw new Error(`git pull timed out after ${timeoutMs / 1000}s: ${dir}`);
  }
  if (exitCode !== 0) {
    throw new Error(`git pull failed: ${stderr.trim()}`);
  }
}
