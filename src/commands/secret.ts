import type { Command } from "commander";
import { resolve, dirname } from "node:path";
import { access, copyFile } from "node:fs/promises";
import pc from "picocolors";
import { showIntro, showOutro, askConfirm, askMultiselect, askText, withSpinner, log } from "../ui/index.js";
import { readConfig } from "../core/config.js";
import {
  readManifest,
  writeManifest,
  copyFileToStore,
  validateFileSize,
  formatFileSize,
  listStoreFiles,
  restoreFileFromStore,
  ensureSecretsGitattributes,
  STORE_DIRS,
} from "../core/store.js";
import * as git from "../core/git.js";
import { SheltrError, withErrorHandling } from "../utils/errors.js";

export function registerSecretCommand(program: Command): void {
  const secret = program
    .command("secret")
    .description("Store and restore encrypted secret files");

  secret
    .command("push <path>")
    .description("Store a file (encrypted via git-crypt) in the vault")
    .option("-m, --message <msg>", "Custom commit message")
    .option("--vault <name>", "Use a specific vault")
    .action(withErrorHandling(async (filePath: string, opts: { message?: string; vault?: string }) => {
      showIntro();

      const vault = await resolveVaultForStore(opts.vault);
      log.info(`Using vault: ${pc.bold(vault.name)}`);

      if (!(await git.isVaultCloned(vault.vaultPath))) {
        throw new SheltrError("Vault not found. Run `sheltr setup` first.", "VAULT_NOT_FOUND");
      }

      const absolutePath = resolve(filePath);
      try {
        await access(absolutePath);
      } catch {
        throw new SheltrError(`File not found: ${absolutePath}`, "FILE_NOT_FOUND");
      }

      // Size check
      const { result: sizeResult, sizeBytes } = await validateFileSize(absolutePath);
      if (sizeResult === "block") {
        throw new SheltrError(
          `File is too large (${formatFileSize(sizeBytes)}). Maximum allowed size is 10 MB.`,
          "FILE_TOO_LARGE",
        );
      }
      if (sizeResult === "warn") {
        const proceed = await askConfirm({
          message: `File is ${formatFileSize(sizeBytes)}. Continue?`,
        });
        if (!proceed) {
          showOutro("Push cancelled.");
          return;
        }
      }

      // Sync and store
      await withSpinner({
        start: "Storing secret in vault...",
        stop: "Done!",
        task: async () => {
          const vaultPath = vault.vaultPath;

          if (await git.hasCommits(vaultPath)) {
            await git.pull(vaultPath);
          }

          // Ensure .gitattributes has encryption rule for _secrets/
          const filesToStage: string[] = [];
          const gitattrsModified = await ensureSecretsGitattributes(vaultPath);
          if (gitattrsModified) {
            filesToStage.push(".gitattributes");
          }

          const manifest = await readManifest(vaultPath, "secrets");
          const { entry } = await copyFileToStore(absolutePath, vaultPath, "secrets", manifest);

          // Update manifest (replace existing or add new)
          const existingIdx = manifest.files.findIndex((f) => f.name === entry.name);
          if (existingIdx >= 0) {
            manifest.files[existingIdx] = entry;
          } else {
            manifest.files.push(entry);
          }
          await writeManifest(vaultPath, "secrets", manifest);

          const storeDir = STORE_DIRS.secrets;
          filesToStage.push(
            `${storeDir}/${entry.name}`,
            `${storeDir}/manifest.json`,
          );

          await git.add(vaultPath, filesToStage);

          if (!(await git.hasStagedChanges(vaultPath))) {
            return "no-changes";
          }

          const commitMessage = opts.message ?? `sheltr secret: ${entry.name} ${new Date().toISOString().slice(0, 19)}`;
          await git.commit(vaultPath, commitMessage);
          await git.push(vaultPath);
          return "pushed";
        },
      });

      showOutro();
    }));

  secret
    .command("pull")
    .description("Restore secret files to their original paths")
    .option("--vault <name>", "Use a specific vault")
    .action(withErrorHandling(async (opts: { vault?: string }) => {
      showIntro();

      const vault = await resolveVaultForStore(opts.vault);
      log.info(`Using vault: ${pc.bold(vault.name)}`);

      if (!(await git.isVaultCloned(vault.vaultPath))) {
        throw new SheltrError("Vault not found. Run `sheltr setup` first.", "VAULT_NOT_FOUND");
      }

      if (await git.hasCommits(vault.vaultPath)) {
        await withSpinner({
          start: "Syncing vault...",
          stop: "Vault synced!",
          task: () => git.pull(vault.vaultPath),
        });
      }

      const entries = await listStoreFiles(vault.vaultPath, "secrets");
      if (entries.length === 0) {
        log.warn("No secrets stored in this vault.");
        showOutro("Nothing to pull.");
        return;
      }

      // Show secrets table
      log.info("Stored secrets:");
      for (const entry of entries) {
        console.log(`  ${pc.bold(entry.name)} ${pc.dim("→")} ${pc.dim(entry.originalPath)}`);
      }
      console.log();

      // Select secrets
      const selected = await askMultiselect({
        message: "Select secrets to restore:",
        options: entries.map((e) => ({ value: e.name, label: `${e.name} → ${e.originalPath}` })),
        required: true,
      });

      const selectedEntries = entries.filter((e) => selected.includes(e.name));

      // Restore each secret
      for (const entry of selectedEntries) {
        const destPath = await askText({
          message: `Restore "${entry.name}" to:`,
          defaultValue: entry.originalPath,
          placeholder: entry.originalPath,
        });

        const resolvedDest = resolve(destPath);

        // Check if parent dir exists
        const parentDir = dirname(resolvedDest);
        let parentExists = true;
        try {
          await access(parentDir);
        } catch {
          parentExists = false;
        }

        if (!parentExists) {
          const createDir = await askConfirm({
            message: `Directory "${parentDir}" does not exist. Create it?`,
          });
          if (!createDir) {
            log.info(`Skipped ${entry.name}.`);
            continue;
          }
        }

        // Check if file exists at destination
        let fileExistsAtDest = false;
        try {
          await access(resolvedDest);
          fileExistsAtDest = true;
        } catch {
          // Does not exist
        }

        if (fileExistsAtDest) {
          const overwrite = await askConfirm({
            message: `"${resolvedDest}" already exists. Overwrite? (backup will be created)`,
          });
          if (!overwrite) {
            log.info(`Skipped ${entry.name}.`);
            continue;
          }
          await copyFile(resolvedDest, resolvedDest + ".backup");
          log.info(`Backup created: ${resolvedDest}.backup`);
        }

        await restoreFileFromStore(entry, vault.vaultPath, "secrets", resolvedDest);
        log.success(`Restored ${entry.name} → ${resolvedDest}`);
      }

      showOutro();
    }));

  secret
    .command("list")
    .description("List stored secrets")
    .action(withErrorHandling(async () => {
      showIntro();

      const config = await readConfig();
      if (config.vaults.length === 0) {
        log.info("No vaults configured. Run `sheltr setup` to get started.");
        showOutro();
        return;
      }

      let totalSecrets = 0;

      for (const vault of config.vaults) {
        if (!(await git.isVaultCloned(vault.vaultPath))) {
          log.warn(`Vault "${vault.name}" is not cloned. Run \`sheltr setup\` to fix.`);
          continue;
        }

        if (await git.hasCommits(vault.vaultPath)) {
          await withSpinner({
            start: `Syncing ${vault.name}...`,
            stop: `${vault.name} synced!`,
            task: () => git.pull(vault.vaultPath),
          });
        }

        const entries = await listStoreFiles(vault.vaultPath, "secrets");
        totalSecrets += entries.length;

        if (config.vaults.length > 1) {
          console.log(`\n  ${pc.bold(pc.cyan(vault.name))}  ${pc.dim(vault.repoUrl)}`);
        }

        if (entries.length === 0) {
          console.log(`  ${pc.dim("  (no secrets)")}`);
          continue;
        }

        const indent = config.vaults.length > 1 ? "    " : "  ";
        for (const entry of entries) {
          console.log(`${indent}${pc.bold(entry.name)} ${pc.dim("→")} ${pc.dim(entry.originalPath)}`);
        }
      }

      if (totalSecrets === 0) {
        log.info("No secrets stored yet. Run `sheltr secret push <path>` to get started.");
      }

      console.log();
      showOutro();
    }));
}

async function resolveVaultForStore(vaultName?: string) {
  const config = await readConfig();
  const { vaults } = config;

  if (vaults.length === 0) {
    throw new SheltrError("No vaults configured. Run `sheltr setup` first.", "NO_VAULTS");
  }

  if (vaultName) {
    const vault = vaults.find((v) => v.name === vaultName);
    if (!vault) {
      throw new SheltrError(
        `Vault "${vaultName}" not found. Run \`sheltr vault list\` to see configured vaults.`,
        "VAULT_NOT_FOUND",
      );
    }
    return vault;
  }

  if (vaults.length === 1) {
    return vaults[0];
  }

  const { askSelect } = await import("../ui/prompts.js");
  const selected = await askSelect({
    message: "Select a vault:",
    options: vaults.map((v) => ({
      value: v.name,
      label: `${v.name} (${v.repoUrl})`,
    })),
  });

  const vault = vaults.find((v) => v.name === selected);
  if (!vault) {
    throw new SheltrError("Vault not found.", "VAULT_NOT_FOUND");
  }

  return vault;
}
