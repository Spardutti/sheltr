import { execFile, spawn } from "node:child_process";
import { access, copyFile, chmod } from "node:fs/promises";
import { platform } from "node:os";
import { SheltrError } from "../utils/errors.js";
import { askConfirm } from "../ui/prompts.js";
import { log } from "../ui/logger.js";

function run(
  command: string,
  args: string[],
  cwd?: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(command, args, { cwd }, (error, stdout, stderr) => {
      if (error) {
        const message = stderr?.trim() || error.message;
        reject(new SheltrError(message, "CRYPT_ERROR"));
        return;
      }
      resolve(stdout.trim());
    });
  });
}

/** Run a command with inherited stdio so the user can interact (e.g. sudo password). */
function runInteractive(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit" });
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new SheltrError(`Command failed with exit code ${code}`, "INSTALL_ERROR"));
        return;
      }
      resolve();
    });
    child.on("error", (err) => {
      reject(new SheltrError(err.message, "INSTALL_ERROR"));
    });
  });
}

type PackageManager = { name: string; command: string };

async function detectPackageManager(): Promise<PackageManager | null> {
  const os = platform();

  if (os === "darwin") {
    try {
      await run("brew", ["--version"]);
      return { name: "Homebrew", command: "brew install git-crypt" };
    } catch {
      return null;
    }
  }

  if (os === "linux") {
    // Try apt (Debian/Ubuntu)
    try {
      await run("apt", ["--version"]);
      return { name: "apt", command: "sudo apt install -y git-crypt" };
    } catch { /* not available */ }

    // Try dnf (Fedora)
    try {
      await run("dnf", ["--version"]);
      return { name: "dnf", command: "sudo dnf install -y git-crypt" };
    } catch { /* not available */ }

    // Try pacman (Arch)
    try {
      await run("pacman", ["--version"]);
      return { name: "pacman", command: "sudo pacman -S --noconfirm git-crypt" };
    } catch { /* not available */ }
  }

  return null;
}

/** Check that git-crypt is installed, offer to install if not. */
export async function ensureGitCryptInstalled(): Promise<void> {
  try {
    await run("git-crypt", ["--version"]);
    return;
  } catch {
    // Not installed — try to help
  }

  log.warn("git-crypt is not installed.");

  const pm = await detectPackageManager();

  if (!pm) {
    throw new SheltrError(
      "Could not detect a supported package manager.\n" +
      "  Please install git-crypt manually:\n" +
      "  macOS:  brew install git-crypt\n" +
      "  Linux:  sudo apt install git-crypt",
      "CRYPT_NOT_INSTALLED",
    );
  }

  const install = await askConfirm({
    message: `Install git-crypt using ${pm.name}? (runs: ${pm.command})`,
  });

  if (!install) {
    throw new SheltrError(
      "git-crypt is required. Install it manually and try again.",
      "CRYPT_NOT_INSTALLED",
    );
  }

  log.info(`Running: ${pm.command}\n`);
  await runInteractive("sh", ["-c", pm.command]);
  log.success("git-crypt installed!");

  // Verify it actually worked
  try {
    await run("git-crypt", ["--version"]);
  } catch {
    throw new SheltrError(
      "Installation seemed to succeed but git-crypt is still not found.\n" +
      "  Try installing manually and run `sheltr setup` again.",
      "CRYPT_NOT_INSTALLED",
    );
  }
}

/** Initialize git-crypt in the vault repo. */
export async function initCrypt(vaultPath: string): Promise<void> {
  await run("git-crypt", ["init"], vaultPath);
}

/** Export the git-crypt key to a file. */
export async function exportKey(
  vaultPath: string,
  keyPath: string,
): Promise<void> {
  await run("git-crypt", ["export-key", keyPath], vaultPath);
  // Restrict key file permissions — owner read-only
  await chmod(keyPath, 0o400);
}

/** Unlock a cloned vault repo with an existing key. */
export async function unlockVault(
  vaultPath: string,
  keyPath: string,
): Promise<void> {
  // Validate key file exists before passing to git-crypt
  try {
    await access(keyPath);
  } catch {
    throw new SheltrError(
      `Key file not found: ${keyPath}`,
      "KEY_NOT_FOUND",
    );
  }

  await run("git-crypt", ["unlock", keyPath], vaultPath);
}

/** Import a key by copying it to the sheltr directory. */
export async function importKey(
  sourcePath: string,
  destPath: string,
): Promise<void> {
  // Validate source exists
  try {
    await access(sourcePath);
  } catch {
    throw new SheltrError(
      `Key file not found: ${sourcePath}`,
      "KEY_NOT_FOUND",
    );
  }

  await copyFile(sourcePath, destPath);
  // Restrict key file permissions — owner read-only
  await chmod(destPath, 0o400);
}
