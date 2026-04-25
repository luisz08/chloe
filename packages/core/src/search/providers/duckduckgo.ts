import type { SearchOptions, SearchProvider, SearchResult } from "../types.js";

const DEFAULT_MAX_RESULTS = 5;
const MAX_RESULTS_LIMIT = 20;
const MIN_PYTHON_MAJOR = 3;
const MIN_PYTHON_MINOR = 8;

async function readStream(stream: ReadableStream<Uint8Array>): Promise<string> {
  return new Response(stream).text();
}

async function runProcess(
  cmd: string[],
  opts: { stdin?: string } = {},
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn(cmd, {
    stdout: "pipe",
    stderr: "pipe",
    ...(opts.stdin !== undefined ? { stdin: new TextEncoder().encode(opts.stdin) } : {}),
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    proc.exited,
    readStream(proc.stdout),
    readStream(proc.stderr),
  ]);
  return { exitCode, stdout, stderr };
}

async function detectPython(): Promise<string | null> {
  for (const candidate of ["python3", "python"]) {
    try {
      const { exitCode, stdout, stderr } = await runProcess([candidate, "--version"]);
      if (exitCode !== 0) continue;
      const text = stdout || stderr;
      const m = text.match(/Python (\d+)\.(\d+)/);
      if (!m) continue;
      const major = Number(m[1]);
      const minor = Number(m[2]);
      if (major > MIN_PYTHON_MAJOR || (major === MIN_PYTHON_MAJOR && minor >= MIN_PYTHON_MINOR)) {
        return candidate;
      }
    } catch {
      // candidate not on PATH
    }
  }
  return null;
}

async function isDdgsInstalled(python: string): Promise<boolean> {
  const { exitCode } = await runProcess([python, "-c", "import ddgs"]);
  return exitCode === 0;
}

async function installDdgs(python: string): Promise<void> {
  const { exitCode, stderr } = await runProcess([python, "-m", "pip", "install", "ddgs"]);
  if (exitCode !== 0) {
    throw new Error(`Failed to install ddgs. Run: pip install ddgs\n${stderr}`);
  }
}

const SEARCH_SCRIPT = (query: string, maxResults: number) => `
import sys, json
from ddgs import DDGS
results = []
with DDGS() as ddgs:
    for r in ddgs.text(${JSON.stringify(query)}, max_results=${maxResults}):
        results.append({"title": r["title"], "url": r["href"], "snippet": r.get("body", "")})
print(json.dumps(results))
`;

export class DuckDuckGoProvider implements SearchProvider {
  private _python: string | null | undefined = undefined;
  private _ddgsReady = false;

  private async getPython(): Promise<string> {
    if (this._python === undefined) {
      this._python = await detectPython();
    }
    if (this._python === null) {
      throw new Error(
        "web_search requires Python 3.8+. Install from https://python.org and try again.",
      );
    }
    return this._python;
  }

  private async ensureDdgs(python: string, notify?: (msg: string) => void): Promise<void> {
    if (this._ddgsReady) return;
    if (!(await isDdgsInstalled(python))) {
      notify?.("Installing ddgs package for DuckDuckGo search (one-time setup)…");
      await installDdgs(python);
    }
    this._ddgsReady = true;
  }

  async search(query: string, options: SearchOptions = {}): Promise<SearchResult[]> {
    const maxResults = Math.min(
      Math.max(1, options.maxResults ?? DEFAULT_MAX_RESULTS),
      MAX_RESULTS_LIMIT,
    );

    const python = await this.getPython();
    await this.ensureDdgs(python, options.notify);

    const { exitCode, stdout, stderr } = await runProcess([
      python,
      "-c",
      SEARCH_SCRIPT(query, maxResults),
    ]);

    if (exitCode !== 0) {
      throw new Error(`DuckDuckGo search failed: ${stderr.trim()}`);
    }

    return JSON.parse(stdout.trim()) as SearchResult[];
  }
}
