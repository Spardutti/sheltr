import type { Command } from "commander";
import { basename } from "node:path";
import { showIntro, showOutro, askMultiselect, askConfirm, withSpinner, log } from "../ui/index.js";
import { readConfig } from "../core/config.js";
import { detectProject, scanEnvFiles } from "../core/project.js";
import { ensureGitattributes, copyEnvFilesToVault } from "../core/vault.js";
import * as git from "../core/git.js";
import { withErrorHandling } from "../utils/errors.js";

export function registerPushCommand(program: Command): void {
  program
    .command("push")
    .description("Encrypt and push env files")
    .option("-m, --message <msg>", "Custom commit message")
    .action(withErrorHandling(async (opts: { message?: string }) => {
      showIntro();

      const config = await readConfig();

      // 1. Detect project
      const cwd = process.cwd();
      const project = await detectProject(cwd);

      let projectName: string;
      let projectRoot: string;

      if (project) {
        log.info(`Detected project: ${project.name} (${project.rootPath})`);
        projectName = project.name;
        projectRoot = project.rootPath;
      } else {
        const folderName = basename(cwd);
        const useFolder = await askConfirm({
          message: `No project detected. Use current folder name "${folderName}"?`,
        });

        if (!useFolder) {
          showOutro("Push cancelled.");
          return;
        }

        projectName = folderName;
        projectRoot = cwd;
      }

      // 2. Scan for .env files
      const envFiles = await scanEnvFiles(projectRoot);

      if (envFiles.length === 0) {
        log.warn("No .env files found.");
        showOutro("Nothing to push.");
        return;
      }

      // 3. Let user pick which files
      const selected = await askMultiselect({
        message: "Select env files to push:",
        options: envFiles.map((f) => ({ value: f, label: f })),
        required: true,
      });

      // 4. Confirm
      const confirmed = await askConfirm({
        message: `Push ${selected.length} file(s) to vault?`,
      });

      if (!confirmed) {
        showOutro("Push cancelled.");
        return;
      }

      // 5. Sync to vault
      await withSpinner({
        start: "Syncing to vault...",
        stop: "Push complete!",
        task: async () => {
          const vaultPath = config.vaultPath;

          // Pull latest (only if repo has commits)
          if (await git.hasCommits(vaultPath)) {
            await git.pull(vaultPath);
          }

          // Ensure .gitattributes has git-crypt rule
          const filesToStage: string[] = [];
          const gitattrsCreated = await ensureGitattributes(vaultPath);
          if (gitattrsCreated) {
            filesToStage.push(".gitattributes");
          }

          // Copy .env files into vault
          const copiedPaths = await copyEnvFilesToVault(
            projectRoot,
            projectName,
            vaultPath,
            selected,
          );
          filesToStage.push(...copiedPaths);

          // Stage, commit, push
          await git.add(vaultPath, filesToStage);

          const commitMessage =
            opts.message ?? `sheltr: ${projectName} ${new Date().toISOString().slice(0, 19)}`;
          await git.commit(vaultPath, commitMessage);
          await git.push(vaultPath);
        },
      });

      showOutro("Push complete!");
    }));
}
