import { execFile } from "node:child_process";
import { access } from "node:fs/promises";
import { SheltrError } from "../utils/errors.js";

function run(
  command: string,
  args: string[],
  cwd?: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(command, args, { cwd }, (error, stdout, stderr) => {
      if (error) {
        // Never leak full stderr to the user — it may contain path info
        const message = stderr?.trim() || error.message;
        reject(new SheltrError(message, "GIT_ERROR"));
        return;
      }
      resolve(stdout.trim());
    });
  });
}

export async function cloneRepo(url: string, dest: string): Promise<void> {
  await run("git", ["clone", url, dest]);
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

export async function isVaultCloned(vaultPath: string): Promise<boolean> {
  try {
    await access(vaultPath);
    return isGitRepo(vaultPath);
  } catch {
    return false;
  }
}
