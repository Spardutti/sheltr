import { copyFile, mkdir, readdir, readFile, writeFile, access, rm as fsRm, rename } from "node:fs/promises";
import { dirname, join, relative } from "node:path";

export const ENV_PREFIX = "_env";

const LEGACY_GITATTRIBUTES_RULE = ".env* filter=git-crypt diff=git-crypt";
const MODERN_GITATTRIBUTES_RULE = "_env/**/.env* filter=git-crypt diff=git-crypt";

export type VaultLayout = "legacy" | "modern";

export async function detectVaultLayout(vaultPath: string): Promise<VaultLayout> {
  try {
    const stat = await readdir(join(vaultPath, ENV_PREFIX), { withFileTypes: true });
    if (stat.length > 0) return "modern";
  } catch {
    // _env/ doesn't exist
  }

  // Check if there are any project dirs at root (legacy layout)
  const entries = await readdir(vaultPath, { withFileTypes: true });
  const hasProjectDirs = entries.some(
    (e) => e.isDirectory() && e.name !== ".git" && e.name !== ENV_PREFIX,
  );

  if (hasProjectDirs) return "legacy";

  // Empty vault — treat as modern (new vaults start modern)
  return "modern";
}

export function getProjectDir(vaultPath: string, projectName: string, layout: VaultLayout = "modern"): string {
  if (layout === "modern") {
    return join(vaultPath, ENV_PREFIX, projectName);
  }
  return join(vaultPath, projectName);
}

export function getVaultFilePath(
  vaultPath: string,
  projectName: string,
  file: string,
  layout: VaultLayout = "modern",
): string {
  return join(getProjectDir(vaultPath, projectName, layout), file);
}

export async function ensureGitattributes(vaultPath: string): Promise<boolean> {
  const filePath = join(vaultPath, ".gitattributes");
  let content = "";

  try {
    content = await readFile(filePath, "utf-8");
    if (content.includes(MODERN_GITATTRIBUTES_RULE)) {
      return false;
    }
  } catch {
    // File doesn't exist — will create it
  }

  const newContent = content
    ? content.trimEnd() + "\n" + MODERN_GITATTRIBUTES_RULE + "\n"
    : MODERN_GITATTRIBUTES_RULE + "\n";

  await writeFile(filePath, newContent, "utf-8");
  return true;
}

export async function copyEnvFilesToVault(
  projectRoot: string,
  projectName: string,
  vaultPath: string,
  envFiles: string[],
): Promise<string[]> {
  const vaultRelativePaths: string[] = [];

  for (const file of envFiles) {
    const src = join(projectRoot, file);
    const vaultRelative = join(ENV_PREFIX, projectName, file);
    const dest = join(vaultPath, vaultRelative);

    await mkdir(dirname(dest), { recursive: true });
    await copyFile(src, dest);
    vaultRelativePaths.push(vaultRelative);
  }

  return vaultRelativePaths;
}

export async function listVaultProjects(vaultPath: string): Promise<string[]> {
  const layout = await detectVaultLayout(vaultPath);

  if (layout === "modern") {
    const envDir = join(vaultPath, ENV_PREFIX);
    try {
      const entries = await readdir(envDir, { withFileTypes: true });
      return entries
        .filter((e) => e.isDirectory())
        .map((e) => e.name)
        .sort();
    } catch {
      return [];
    }
  }

  // Legacy layout: project dirs at root
  const entries = await readdir(vaultPath, { withFileTypes: true });
  return entries
    .filter((e) => e.isDirectory() && e.name !== ".git" && e.name !== ENV_PREFIX)
    .map((e) => e.name)
    .sort();
}

export async function listVaultFiles(vaultPath: string, projectName: string): Promise<string[]> {
  const layout = await detectVaultLayout(vaultPath);
  const projectDir = getProjectDir(vaultPath, projectName, layout);
  const results: string[] = [];

  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        await walk(join(dir, entry.name));
        continue;
      }
      if (entry.isFile() && entry.name.startsWith(".env")) {
        const fullPath = join(dir, entry.name);
        const rel = fullPath.slice(projectDir.length + 1);
        results.push(rel);
      }
    }
  }

  await walk(projectDir);
  return results.sort();
}

export async function copyFilesFromVault(
  vaultPath: string,
  projectName: string,
  projectRoot: string,
  files: string[],
): Promise<void> {
  const layout = await detectVaultLayout(vaultPath);
  const projectDir = getProjectDir(vaultPath, projectName, layout);

  for (const file of files) {
    const src = join(projectDir, file);
    const dest = join(projectRoot, file);
    await mkdir(dirname(dest), { recursive: true });
    await copyFile(src, dest);
  }
}

export async function removeVaultProject(vaultPath: string, projectName: string): Promise<void> {
  const layout = await detectVaultLayout(vaultPath);
  const projectDir = getProjectDir(vaultPath, projectName, layout);
  await fsRm(projectDir, { recursive: true, force: true });
}

export function getProjectDirRelative(projectName: string, layout: VaultLayout = "modern"): string {
  if (layout === "modern") {
    return join(ENV_PREFIX, projectName);
  }
  return projectName;
}

export async function migrateVaultLayout(vaultPath: string): Promise<{ migrated: string[] }> {
  const layout = await detectVaultLayout(vaultPath);
  if (layout === "modern") {
    return { migrated: [] };
  }

  // Read current .gitattributes
  const gitattrsPath = join(vaultPath, ".gitattributes");
  let gitattrsContent = "";
  try {
    gitattrsContent = await readFile(gitattrsPath, "utf-8");
  } catch {
    // no .gitattributes
  }

  // Step 1: Add modern rule (keep legacy rule too for safety during transition)
  if (!gitattrsContent.includes(MODERN_GITATTRIBUTES_RULE)) {
    const updated = gitattrsContent
      ? gitattrsContent.trimEnd() + "\n" + MODERN_GITATTRIBUTES_RULE + "\n"
      : MODERN_GITATTRIBUTES_RULE + "\n";
    await writeFile(gitattrsPath, updated, "utf-8");
  }

  // Step 2: Discover projects at root level
  const entries = await readdir(vaultPath, { withFileTypes: true });
  const projectDirs = entries
    .filter((e) => e.isDirectory() && e.name !== ".git" && e.name !== ENV_PREFIX)
    .map((e) => e.name);

  // Step 3: Create _env/ and move each project
  const envDir = join(vaultPath, ENV_PREFIX);
  await mkdir(envDir, { recursive: true });

  for (const project of projectDirs) {
    const oldPath = join(vaultPath, project);
    const newPath = join(envDir, project);
    await rename(oldPath, newPath);
  }

  // Step 4: Remove legacy rule from .gitattributes, keep only modern
  const finalContent = await readFile(gitattrsPath, "utf-8");
  const lines = finalContent.split("\n").filter(
    (line) => line.trim() !== LEGACY_GITATTRIBUTES_RULE,
  );
  await writeFile(gitattrsPath, lines.join("\n"), "utf-8");

  return { migrated: projectDirs };
}

export async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function filesMatch(pathA: string, pathB: string): Promise<boolean> {
  const [bufA, bufB] = await Promise.all([
    readFile(pathA),
    readFile(pathB),
  ]);
  return bufA.equals(bufB);
}
