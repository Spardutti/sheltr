import { readdir, stat } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";

export interface DetectedProject {
  rootPath: string;
  name: string;
}

export const PROJECT_MARKERS = [
  ".git",
  "package.json",
  "pyproject.toml",
  "Cargo.toml",
  "go.mod",
  "composer.json",
];

const EXCLUDED_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  ".nuxt",
  "vendor",
  "__pycache__",
  "target",
]);

export async function detectProject(startDir: string): Promise<DetectedProject | null> {
  let dir = resolve(startDir);

  while (true) {
    for (const marker of PROJECT_MARKERS) {
      try {
        await stat(join(dir, marker));
        return { rootPath: dir, name: basename(dir) };
      } catch {
        // marker not found, continue
      }
    }

    const parent = dirname(dir);
    if (parent === dir) {
      // reached filesystem root
      return null;
    }
    dir = parent;
  }
}

export async function scanEnvFiles(rootPath: string): Promise<string[]> {
  const results: string[] = [];

  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!EXCLUDED_DIRS.has(entry.name)) {
          await walk(join(dir, entry.name));
        }
        continue;
      }

      if (entry.isFile() && entry.name.startsWith(".env")) {
        // Return path relative to rootPath
        const fullPath = join(dir, entry.name);
        const relative = fullPath.slice(rootPath.length + 1);
        results.push(relative);
      }
    }
  }

  await walk(rootPath);
  return results.sort();
}
