import type { Command } from "commander";
import { basename, join } from "node:path";
import pc from "picocolors";
import { showIntro, showOutro, log } from "../ui/index.js";
import { readConfig } from "../core/config.js";
import { detectProject } from "../core/project.js";
import { scanEnvFiles } from "../core/project.js";
import { listVaultProjects, listVaultFiles, fileExists, filesMatch } from "../core/vault.js";
import * as git from "../core/git.js";
import { SheltrError, withErrorHandling } from "../utils/errors.js";

export type FileStatus = "in-sync" | "modified" | "local-only" | "vault-only";

interface FileEntry {
  file: string;
  status: FileStatus;
}

export function registerStatusCommand(program: Command): void {
  program
    .command("status [project]")
    .description("Show sync status of env files between local and vault")
    .action(withErrorHandling(async (projectArg?: string) => {
      showIntro();

      const config = await readConfig();
      const vaultPath = config.vaultPath;

      if (!(await git.isVaultCloned(vaultPath))) {
        throw new SheltrError("Vault not found. Run `sheltr setup` first.", "VAULT_NOT_FOUND");
      }

      // Resolve project
      const cwd = process.cwd();
      let projectName: string;
      let projectRoot: string;

      if (projectArg) {
        projectName = projectArg;
        projectRoot = cwd;
      } else {
        const project = await detectProject(cwd);
        if (project) {
          projectName = project.name;
          projectRoot = project.rootPath;
        } else {
          projectName = basename(cwd);
          projectRoot = cwd;
        }
      }

      // Check if project exists in vault
      const vaultProjects = await listVaultProjects(vaultPath);
      const projectInVault = vaultProjects.includes(projectName);

      // Gather files from both sides
      const localFiles = await scanEnvFiles(projectRoot);
      const vaultFiles = projectInVault ? await listVaultFiles(vaultPath, projectName) : [];

      const allFiles = [...new Set([...localFiles, ...vaultFiles])].sort();

      if (allFiles.length === 0) {
        log.info(`No env files found for "${projectName}" (local or vault).`);
        showOutro();
        return;
      }

      // Determine status for each file
      const entries: FileEntry[] = [];

      for (const file of allFiles) {
        const localPath = join(projectRoot, file);
        const vaultFilePath = join(vaultPath, projectName, file);

        const hasLocal = await fileExists(localPath);
        const hasVault = await fileExists(vaultFilePath);

        let status: FileStatus;

        if (hasLocal && hasVault) {
          const match = await filesMatch(localPath, vaultFilePath);
          status = match ? "in-sync" : "modified";
        } else if (hasLocal) {
          status = "local-only";
        } else {
          status = "vault-only";
        }

        entries.push({ file, status });
      }

      // Display
      log.info(`Project: ${pc.bold(projectName)}\n`);

      for (const { file, status } of entries) {
        const label = formatStatus(status);
        console.log(`  ${file.padEnd(30)} ${label}`);
      }

      console.log();
      showOutro();
    }));
}

function formatStatus(status: FileStatus): string {
  switch (status) {
    case "in-sync":
      return pc.green("in sync");
    case "modified":
      return pc.yellow("modified");
    case "local-only":
      return pc.blue("local only");
    case "vault-only":
      return pc.magenta("vault only");
  }
}
