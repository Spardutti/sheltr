import { readFile, writeFile, mkdir, chmod, access } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { SheltrError } from "../utils/errors.js";

export interface SheltrConfig {
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

export async function ensureSheltrDir(): Promise<void> {
  await mkdir(SHELTR_DIR, { recursive: true });
  // Restrict directory permissions — only owner can read/write/list
  await chmod(SHELTR_DIR, 0o700);
}

export async function configExists(): Promise<boolean> {
  try {
    await access(CONFIG_PATH);
    return true;
  } catch {
    return false;
  }
}

export async function readConfig(): Promise<SheltrConfig> {
  try {
    const raw = await readFile(CONFIG_PATH, "utf-8");
    const parsed = JSON.parse(raw);

    if (!parsed.repoUrl || !parsed.keyPath || !parsed.vaultPath) {
      throw new SheltrError(
        "Config file is missing required fields. Run `sheltr setup` to reconfigure.",
        "CONFIG_INVALID",
      );
    }

    return parsed as SheltrConfig;
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
