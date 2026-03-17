import { execFile } from "node:child_process";
import { access } from "node:fs/promises";
import { SheltrError } from "../utils/errors.js";

const DEFAULT_TIMEOUT = 30_000; // 30 seconds

function run(
  command: string,
  args: string[],
  cwd?: string,
  timeoutMs: number = DEFAULT_TIMEOUT,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const env = { ...process.env, GIT_TERMINAL_PROMPT: "0" };
    const child = execFile(command, args, { cwd, timeout: timeoutMs, env }, (error, stdout, stderr) => {
      if (error) {
        const stderrMsg = stderr?.trim() || "";
        const message = classifyGitError(stderrMsg, error);
        reject(new SheltrError(message, "GIT_ERROR"));
        return;
      }
      resolve(stdout.trim());
    });

    // Prevent git from hanging waiting for credentials
    child.stdin?.end();
  });
}

function classifyGitError(stderr: string, error: Error): string {
  const msg = stderr.toLowerCase();

  if ((error as NodeJS.ErrnoException & { killed?: boolean }).killed || msg.includes("timed out")) {
    return "Operation timed out. Check your network connection and try again.";
  }
  if (msg.includes("repository not found") || msg.includes("does not exist")) {
    return "Repository not found. Check the URL and make sure the repo exists.";
  }
  if (msg.includes("authentication") || msg.includes("permission denied") || msg.includes("could not read from remote") || msg.includes("terminal prompts disabled")) {
    return "Authentication failed. Check your credentials and repo access.\n  Tip: use an SSH URL (git@github.com:user/repo) or set up a GitHub credential helper.";
  }
  if (msg.includes("already exists and is not an empty directory")) {
    return "Vault directory already exists. Run `sheltr setup` to reconfigure.";
  }
  if (msg.includes("could not resolve host")) {
    return "Could not connect to server. Check your internet connection.";
  }

  return stderr || error.message;
}

export async function cloneRepo(url: string, dest: string): Promise<void> {
  await run("git", ["clone", url, dest], undefined, 60_000);
}

export async function pull(cwd: string): Promise<void> {
  await run("git", ["pull"], cwd);
}

export async function add(cwd: string, files: string[]): Promise<void> {
  await run("git", ["add", ...files], cwd);
}

export async function commit(cwd: string, message: string): Promise<void> {
  await run("git", ["commit", "-m", message], cwd);
}

export async function push(cwd: string): Promise<void> {
  await run("git", ["push"], cwd);
}

export async function isGitRepo(dir: string): Promise<boolean> {
  try {
    await run("git", ["rev-parse", "--git-dir"], dir);
    return true;
  } catch {
    return false;
  }
}

export async function hasCommits(cwd: string): Promise<boolean> {
  try {
    await run("git", ["rev-parse", "HEAD"], cwd);
    return true;
  } catch {
    return false;
  }
}

export async function rm(cwd: string, files: string[], recursive?: boolean): Promise<void> {
  const args = ["rm"];
  if (recursive) args.push("-r");
  args.push("--", ...files);
  await run("git", args, cwd);
}

export async function hasStagedChanges(cwd: string): Promise<boolean> {
  try {
    await run("git", ["diff", "--cached", "--quiet"], cwd);
    return false; // exit 0 = no changes
  } catch {
    return true; // exit 1 = there are changes
  }
}

export async function isVaultCloned(vaultPath: string): Promise<boolean> {
  try {
    await access(vaultPath);
    return isGitRepo(vaultPath);
  } catch {
    return false;
  }
}
