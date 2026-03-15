import { copyFile, mkdir, readdir, readFile, writeFile, access, rm as fsRm } from "node:fs/promises";
import { dirname, join } from "node:path";

const GITATTRIBUTES_RULE = ".env* filter=git-crypt diff=git-crypt";

export async function ensureGitattributes(vaultPath: string): Promise<boolean> {
  const filePath = join(vaultPath, ".gitattributes");
  let content = "";

  try {
    content = await readFile(filePath, "utf-8");
    if (content.includes(GITATTRIBUTES_RULE)) {
      return false;
    }
  } catch {
    // File doesn't exist — will create it
  }

  const newContent = content
    ? content.trimEnd() + "\n" + GITATTRIBUTES_RULE + "\n"
    : GITATTRIBUTES_RULE + "\n";

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
    const vaultRelative = join(projectName, file);
    const dest = join(vaultPath, vaultRelative);

    await mkdir(dirname(dest), { recursive: true });
    await copyFile(src, dest);
    vaultRelativePaths.push(vaultRelative);
  }

  return vaultRelativePaths;
}

export async function listVaultProjects(vaultPath: string): Promise<string[]> {
  const entries = await readdir(vaultPath, { withFileTypes: true });
  return entries
    .filter((e) => e.isDirectory() && e.name !== ".git")
    .map((e) => e.name)
    .sort();
}

export async function listVaultFiles(vaultPath: string, projectName: string): Promise<string[]> {
  const projectDir = join(vaultPath, projectName);
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
        const relative = fullPath.slice(projectDir.length + 1);
        results.push(relative);
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
  for (const file of files) {
    const src = join(vaultPath, projectName, file);
    const dest = join(projectRoot, file);
    await mkdir(dirname(dest), { recursive: true });
    await copyFile(src, dest);
  }
}

export async function removeVaultProject(vaultPath: string, projectName: string): Promise<void> {
  const projectDir = join(vaultPath, projectName);
  await fsRm(projectDir, { recursive: true, force: true });
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
