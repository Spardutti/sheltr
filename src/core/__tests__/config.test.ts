import { beforeEach, describe, expect, it, vi } from "vitest";
import { vol } from "memfs";

vi.mock("node:fs");
vi.mock("node:fs/promises");

// Mock os.homedir so paths are predictable
vi.mock("node:os", () => ({
  homedir: () => "/home/testuser",
}));

import {
  getSheltrDir,
  getConfigPath,
  getDefaultVaultPath,
  getDefaultKeyPath,
  ensureSheltrDir,
  configExists,
  readConfig,
  writeConfig,
} from "../config.js";

beforeEach(() => {
  vol.reset();
});

describe("path helpers", () => {
  it("returns_sheltr_dir_under_home", () => {
    expect(getSheltrDir()).toBe("/home/testuser/.sheltr");
  });

  it("returns_config_path_under_sheltr_dir", () => {
    expect(getConfigPath()).toBe("/home/testuser/.sheltr/config.json");
  });

  it("returns_default_vault_path", () => {
    expect(getDefaultVaultPath()).toBe("/home/testuser/.sheltr/vault");
  });

  it("returns_default_key_path", () => {
    expect(getDefaultKeyPath()).toBe("/home/testuser/.sheltr/key");
  });
});

describe("ensureSheltrDir", () => {
  it("creates_sheltr_directory", async () => {
    vol.fromJSON({});

    await ensureSheltrDir();

    expect(vol.existsSync("/home/testuser/.sheltr")).toBe(true);
  });
});

describe("configExists", () => {
  it("returns_true_when_config_file_exists", async () => {
    vol.fromJSON({ "/home/testuser/.sheltr/config.json": "{}" });

    expect(await configExists()).toBe(true);
  });

  it("returns_false_when_config_file_missing", async () => {
    vol.fromJSON({});

    expect(await configExists()).toBe(false);
  });
});

describe("readConfig", () => {
  it("reads_and_parses_valid_config", async () => {
    const config = {
      repoUrl: "git@github.com:user/vault.git",
      keyPath: "/home/testuser/.sheltr/key",
      vaultPath: "/home/testuser/.sheltr/vault",
    };
    vol.fromJSON({
      "/home/testuser/.sheltr/config.json": JSON.stringify(config),
    });

    const result = await readConfig();

    expect(result).toEqual(config);
  });

  it("throws_when_config_missing_required_fields", async () => {
    vol.fromJSON({
      "/home/testuser/.sheltr/config.json": JSON.stringify({ repoUrl: "x" }),
    });

    await expect(readConfig()).rejects.toThrow("missing required fields");
  });

  it("throws_when_config_file_does_not_exist", async () => {
    vol.fromJSON({});

    await expect(readConfig()).rejects.toThrow("Could not read config");
  });

  it("throws_when_config_is_invalid_json", async () => {
    vol.fromJSON({
      "/home/testuser/.sheltr/config.json": "not json{{{",
    });

    await expect(readConfig()).rejects.toThrow("Could not read config");
  });
});

describe("writeConfig", () => {
  it("writes_config_as_pretty_json", async () => {
    vol.fromJSON({});

    const config = {
      repoUrl: "git@github.com:user/vault.git",
      keyPath: "/home/testuser/.sheltr/key",
      vaultPath: "/home/testuser/.sheltr/vault",
    };

    await writeConfig(config);

    const raw = vol.readFileSync("/home/testuser/.sheltr/config.json", "utf-8") as string;
    expect(JSON.parse(raw)).toEqual(config);
    expect(raw).toContain("\n"); // pretty printed
  });
});
