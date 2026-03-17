import { readFile, writeFile, mkdir, chmod, access } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { SheltrError } from "../utils/errors.js";

export interface VaultEntry {
  name: string;
  repoUrl: string;
  keyPath: string;
  vaultPath: string;
}

export interface SheltrConfig {
  vaults: VaultEntry[];
}

interface LegacyConfig {
  repoUrl: string;
  keyPath: string;
  vaultPath: string;
}

const SHELTR_DIR = join(homedir(), ".sheltr");
const CONFIG_PATH = join(SHELTR_DIR, "config.json");

export function getSheltrDir(): string {
  return SHELTR_DIR;
}

export function getConfigPath(): string {
  return CONFIG_PATH;
}

export function getDefaultVaultPath(): string {
  return join(SHELTR_DIR, "vault");
}

export function getDefaultKeyPath(): string {
  return join(SHELTR_DIR, "key");
}

export function getVaultDir(vaultName: string): string {
  return join(SHELTR_DIR, "vaults", vaultName);
}

export function getDefaultVaultPathForName(vaultName: string): string {
  return join(SHELTR_DIR, "vaults", vaultName, "repo");
}

export function getDefaultKeyPathForName(vaultName: string): string {
  return join(SHELTR_DIR, "vaults", vaultName, "key");
}

export async function ensureSheltrDir(): Promise<void> {
  await mkdir(SHELTR_DIR, { recursive: true });
  await chmod(SHELTR_DIR, 0o700);
}

export async function ensureVaultDir(vaultName: string): Promise<void> {
  const dir = getVaultDir(vaultName);
  await mkdir(dir, { recursive: true });
  await chmod(dir, 0o700);
}

export async function configExists(): Promise<boolean> {
  try {
    await access(CONFIG_PATH);
    return true;
  } catch {
    return false;
  }
}

function isLegacyConfig(parsed: unknown): parsed is LegacyConfig {
  return (
    typeof parsed === "object" &&
    parsed !== null &&
    "repoUrl" in parsed &&
    !("vaults" in parsed)
  );
}

function isValidConfig(parsed: unknown): parsed is SheltrConfig {
  if (typeof parsed !== "object" || parsed === null || !("vaults" in parsed)) {
    return false;
  }

  const config = parsed as SheltrConfig;

  if (!Array.isArray(config.vaults)) return false;

  return config.vaults.every(
    (v) => v.name && v.repoUrl && v.keyPath && v.vaultPath,
  );
}

export async function readConfig(): Promise<SheltrConfig> {
  try {
    const raw = await readFile(CONFIG_PATH, "utf-8");
    const parsed = JSON.parse(raw);

    if (isLegacyConfig(parsed)) {
      const migrated: SheltrConfig = {
        vaults: [
          {
            name: "default",
            repoUrl: parsed.repoUrl,
            keyPath: parsed.keyPath,
            vaultPath: parsed.vaultPath,
          },
        ],
      };
      await writeConfig(migrated);
      return migrated;
    }

    if (!isValidConfig(parsed)) {
      throw new SheltrError(
        "Config file is missing required fields. Run `sheltr setup` to reconfigure.",
        "CONFIG_INVALID",
      );
    }

    return parsed;
  } catch (err) {
    if (err instanceof SheltrError) throw err;
    throw new SheltrError(
      "Could not read config. Run `sheltr setup` first.",
      "CONFIG_NOT_FOUND",
    );
  }
}

export async function writeConfig(config: SheltrConfig): Promise<void> {
  await ensureSheltrDir();
  const data = JSON.stringify(config, null, 2) + "\n";
  await writeFile(CONFIG_PATH, data, { mode: 0o600 });
}

export interface ResolveVaultOptions {
  vaultName?: string;
  projectName?: string;
}

export async function resolveVault(opts: ResolveVaultOptions = {}): Promise<VaultEntry> {
  const config = await readConfig();
  const { vaults } = config;

  if (vaults.length === 0) {
    throw new SheltrError(
      "No vaults configured. Run `sheltr setup` first.",
      "NO_VAULTS",
    );
  }

  // Explicit --vault flag: use that vault directly
  if (opts.vaultName) {
    const vault = vaults.find((v) => v.name === opts.vaultName);
    if (!vault) {
      throw new SheltrError(
        `Vault "${opts.vaultName}" not found. Run \`sheltr vault list\` to see configured vaults.`,
        "VAULT_NOT_FOUND",
      );
    }
    return vault;
  }

  // Single vault: always auto-select
  if (vaults.length === 1) {
    return vaults[0];
  }

  // Multiple vaults + project name: infer from vault contents
  if (opts.projectName) {
    const { listVaultProjects } = await import("./vault.js");
    const matches: VaultEntry[] = [];

    for (const v of vaults) {
      try {
        const projects = await listVaultProjects(v.vaultPath);
        if (projects.includes(opts.projectName)) {
          matches.push(v);
        }
      } catch {
        // Vault may not be cloned yet, skip
      }
    }

    if (matches.length === 1) {
      return matches[0];
    }

    // Project found in multiple vaults — tell the user why we're asking
    if (matches.length > 1) {
      const { log } = await import("../ui/logger.js");
      log.info(`Project "${opts.projectName}" found in multiple vaults.`);
    }
  }

  // Fall back to prompting
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
