import { copyFile, mkdir, readdir, readFile, writeFile, stat, access, rm as fsRm } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";

export type StoreType = "files" | "secrets";

export interface ManifestEntry {
  name: string;
  originalPath: string;
}

export interface Manifest {
  files: ManifestEntry[];
}

export const STORE_DIRS: Record<StoreType, string> = {
  files: "_files",
  secrets: "_secrets",
};

const SECRET_EXTENSIONS = new Set([
  ".pem", ".key", ".p12", ".pfx", ".crt", ".cer", ".der",
  ".jks", ".keystore", ".gpg", ".asc",
]);

const SECRET_FILENAMES = new Set([
  "id_rsa", "id_ed25519", "id_ecdsa", "id_dsa",
  "credentials", "credentials.json", "credentials.yaml", "credentials.yml",
  ".npmrc", ".pypirc", ".netrc", ".htpasswd",
  "service-account.json", "serviceAccountKey.json",
]);

const SECRET_CONTENT_PREFIXES = [
  "-----BEGIN",
  "ssh-rsa",
  "ssh-ed25519",
  "ssh-ecdsa",
  "ecdsa-sha2",
];

const SECRETS_GITATTRIBUTES_RULE = "_secrets/** filter=git-crypt diff=git-crypt";

export function getStoreDir(vaultPath: string, storeType: StoreType): string {
  return join(vaultPath, STORE_DIRS[storeType]);
}

export async function readManifest(vaultPath: string, storeType: StoreType): Promise<Manifest> {
  const manifestPath = join(getStoreDir(vaultPath, storeType), "manifest.json");
  try {
    const raw = await readFile(manifestPath, "utf-8");
    return JSON.parse(raw) as Manifest;
  } catch {
    return { files: [] };
  }
}

export async function writeManifest(vaultPath: string, storeType: StoreType, manifest: Manifest): Promise<void> {
  const storeDir = getStoreDir(vaultPath, storeType);
  await mkdir(storeDir, { recursive: true });
  const manifestPath = join(storeDir, "manifest.json");
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf-8");
}

export function resolveStoreName(baseName: string, manifest: Manifest): string {
  const existingNames = new Set(manifest.files.map((f) => f.name));
  if (!existingNames.has(baseName)) return baseName;

  let counter = 2;
  while (true) {
    const dotIndex = baseName.lastIndexOf(".");
    let candidate: string;
    if (dotIndex > 0) {
      candidate = `${baseName.slice(0, dotIndex)}-${counter}${baseName.slice(dotIndex)}`;
    } else {
      candidate = `${baseName}-${counter}`;
    }
    if (!existingNames.has(candidate)) return candidate;
    counter++;
  }
}

export async function detectSecret(filePath: string): Promise<boolean> {
  const name = basename(filePath);
  const ext = name.includes(".") ? "." + name.split(".").pop()! : "";

  if (SECRET_EXTENSIONS.has(ext.toLowerCase())) return true;
  if (SECRET_FILENAMES.has(name)) return true;

  try {
    const fd = await readFile(filePath);
    const head = fd.subarray(0, 64).toString("utf-8");
    for (const prefix of SECRET_CONTENT_PREFIXES) {
      if (head.includes(prefix)) return true;
    }
  } catch {
    // Can't read content — skip content check
  }

  return false;
}

export type FileSizeResult = "ok" | "warn" | "block";

export async function validateFileSize(filePath: string): Promise<{ result: FileSizeResult; sizeBytes: number }> {
  const stats = await stat(filePath);
  const sizeBytes = stats.size;

  if (sizeBytes > 10 * 1024 * 1024) return { result: "block", sizeBytes };
  if (sizeBytes > 1 * 1024 * 1024) return { result: "warn", sizeBytes };
  return { result: "ok", sizeBytes };
}

export async function copyFileToStore(
  filePath: string,
  vaultPath: string,
  storeType: StoreType,
  manifest: Manifest,
): Promise<{ storeName: string; entry: ManifestEntry }> {
  const absolutePath = resolve(filePath);
  const baseName = basename(absolutePath);

  // Check if same file from same path already exists
  const existing = manifest.files.find((f) => f.originalPath === absolutePath);
  const storeName = existing ? existing.name : resolveStoreName(baseName, manifest);

  const storeDir = getStoreDir(vaultPath, storeType);
  const destPath = join(storeDir, storeName);

  await mkdir(storeDir, { recursive: true });
  await copyFile(absolutePath, destPath);

  const entry: ManifestEntry = { name: storeName, originalPath: absolutePath };
  return { storeName, entry };
}

export async function listStoreFiles(vaultPath: string, storeType: StoreType): Promise<ManifestEntry[]> {
  const manifest = await readManifest(vaultPath, storeType);
  return manifest.files;
}

export async function removeFromStore(
  vaultPath: string,
  storeType: StoreType,
  entryName: string,
): Promise<Manifest> {
  const manifest = await readManifest(vaultPath, storeType);
  const storeDir = getStoreDir(vaultPath, storeType);
  const filePath = join(storeDir, entryName);

  try {
    await fsRm(filePath);
  } catch {
    // File may already be gone
  }

  manifest.files = manifest.files.filter((f) => f.name !== entryName);
  await writeManifest(vaultPath, storeType, manifest);
  return manifest;
}

export async function ensureSecretsGitattributes(vaultPath: string): Promise<boolean> {
  const filePath = join(vaultPath, ".gitattributes");
  let content = "";

  try {
    content = await readFile(filePath, "utf-8");
    if (content.includes(SECRETS_GITATTRIBUTES_RULE)) {
      return false;
    }
  } catch {
    // File doesn't exist — will create it
  }

  const newContent = content
    ? content.trimEnd() + "\n" + SECRETS_GITATTRIBUTES_RULE + "\n"
    : SECRETS_GITATTRIBUTES_RULE + "\n";

  await writeFile(filePath, newContent, "utf-8");
  return true;
}

export async function restoreFileFromStore(
  entry: ManifestEntry,
  vaultPath: string,
  storeType: StoreType,
  destPath: string,
): Promise<void> {
  const storeDir = getStoreDir(vaultPath, storeType);
  const srcPath = join(storeDir, entry.name);
  await mkdir(dirname(destPath), { recursive: true });
  await copyFile(srcPath, destPath);
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
