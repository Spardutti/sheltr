import type { Command } from "commander";
import { basename } from "node:path";
import pc from "picocolors";
import { showIntro, showOutro, withSpinner, log } from "../ui/index.js";
import { readConfig, type VaultEntry } from "../core/config.js";
import { detectProject } from "../core/project.js";
import { listVaultProjects, listVaultFiles } from "../core/vault.js";
import { listStoreFiles, type StoreType } from "../core/store.js";
import * as git from "../core/git.js";
import { withErrorHandling } from "../utils/errors.js";

async function printEnvs(vaultPath: string, indent: string, currentName: string): Promise<number> {
  const projects = await listVaultProjects(vaultPath);
  console.log(`${indent}${pc.bold(pc.magenta("Envs"))}`);

  if (projects.length === 0) {
    console.log(`${indent}  ${pc.dim("(none)")}`);
    return 0;
  }

  for (const project of projects) {
    const files = await listVaultFiles(vaultPath, project);
    const marker = project === currentName ? pc.green(" ←") : "";
    console.log(`${indent}  ${pc.bold(project)} ${pc.dim(`(${files.length} file${files.length === 1 ? "" : "s"})`)}${marker}`);
    for (const file of files) {
      console.log(`${indent}    ${pc.dim(file)}`);
    }
  }
  return projects.length;
}

async function printStore(vaultPath: string, storeType: StoreType, indent: string): Promise<number> {
  const entries = await listStoreFiles(vaultPath, storeType);
  const title = storeType === "files" ? "Files" : "Secrets";
  console.log(`\n${indent}${pc.bold(pc.magenta(title))}`);

  if (entries.length === 0) {
    console.log(`${indent}  ${pc.dim("(none)")}`);
    return 0;
  }

  for (const entry of entries) {
    console.log(`${indent}  ${pc.bold(entry.name)} ${pc.dim("→")} ${pc.dim(entry.originalPath)}`);
  }
  return entries.length;
}

async function printVault(vault: VaultEntry, showHeader: boolean, currentName: string): Promise<number> {
  if (!(await git.isVaultCloned(vault.vaultPath))) {
    log.warn(`Vault "${vault.name}" is not cloned. Run \`sheltr setup\` to fix.`);
    return 0;
  }

  if (await git.hasCommits(vault.vaultPath)) {
    await withSpinner({
      start: `Syncing ${vault.name}...`,
      stop: `${vault.name} synced!`,
      task: () => git.pull(vault.vaultPath),
    });
  }

  if (showHeader) {
    console.log(`\n  ${pc.bold(pc.cyan(vault.name))}  ${pc.dim(vault.repoUrl)}`);
  }

  const indent = showHeader ? "    " : "  ";
  const envCount = await printEnvs(vault.vaultPath, indent, currentName);
  const fileCount = await printStore(vault.vaultPath, "files", indent);
  const secretCount = await printStore(vault.vaultPath, "secrets", indent);
  return envCount + fileCount + secretCount;
}

export function registerListCommand(program: Command): void {
  program
    .command("list")
    .description("List stored envs, files, and secrets")
    .action(withErrorHandling(async () => {
      showIntro();

      const config = await readConfig();

      if (config.vaults.length === 0) {
        log.info("No vaults configured. Run `sheltr setup` to get started.");
        showOutro();
        return;
      }

      const detected = await detectProject(process.cwd());
      const currentName = detected?.name ?? basename(process.cwd());
      const showHeader = config.vaults.length > 1;

      let total = 0;
      for (const vault of config.vaults) {
        total += await printVault(vault, showHeader, currentName);
      }

      if (total === 0) {
        log.info("Nothing stored yet. Run `sheltr push` to get started.");
      }

      console.log();
      showOutro();
    }));
}
