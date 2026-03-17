import { beforeEach, describe, expect, it, vi } from "vitest";
import { vol } from "memfs";

vi.mock("node:fs");
vi.mock("node:fs/promises");

vi.mock("node:os", () => ({
  homedir: () => "/home/testuser",
}));

import {
  getSheltrDir,
  getConfigPath,
  getDefaultVaultPath,
  getDefaultKeyPath,
  getVaultDir,
  getDefaultVaultPathForName,
  getDefaultKeyPathForName,
  ensureSheltrDir,
  ensureVaultDir,
  configExists,
  readConfig,
  writeConfig,
  resolveVault,
} from "../config.js";

beforeEach(() => {
  vol.reset();
  vi.restoreAllMocks();
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

describe("per-vault path helpers", () => {
  it("returns_vault_dir_for_name", () => {
    expect(getVaultDir("work")).toBe("/home/testuser/.sheltr/vaults/work");
  });

  it("returns_vault_path_for_name", () => {
    expect(getDefaultVaultPathForName("work")).toBe("/home/testuser/.sheltr/vaults/work/repo");
  });

  it("returns_key_path_for_name", () => {
    expect(getDefaultKeyPathForName("work")).toBe("/home/testuser/.sheltr/vaults/work/key");
  });
});

describe("ensureSheltrDir", () => {
  it("creates_sheltr_directory", async () => {
    vol.fromJSON({});

    await ensureSheltrDir();

    expect(vol.existsSync("/home/testuser/.sheltr")).toBe(true);
  });
});

describe("ensureVaultDir", () => {
  it("creates_per_vault_directory", async () => {
    vol.fromJSON({});

    await ensureVaultDir("work");

    expect(vol.existsSync("/home/testuser/.sheltr/vaults/work")).toBe(true);
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
  it("reads_and_parses_valid_multi_vault_config", async () => {
    const config = {
      vaults: [
        {
          name: "personal",
          repoUrl: "git@github.com:user/vault.git",
          keyPath: "/home/testuser/.sheltr/vaults/personal/key",
          vaultPath: "/home/testuser/.sheltr/vaults/personal/repo",
        },
      ],
    };
    vol.fromJSON({
      "/home/testuser/.sheltr/config.json": JSON.stringify(config),
    });

    const result = await readConfig();

    expect(result).toEqual(config);
  });

  it("migrates_legacy_flat_config_to_multi_vault", async () => {
    const legacy = {
      repoUrl: "git@github.com:user/vault.git",
      keyPath: "/home/testuser/.sheltr/key",
      vaultPath: "/home/testuser/.sheltr/vault",
    };
    vol.fromJSON({
      "/home/testuser/.sheltr/config.json": JSON.stringify(legacy),
    });

    const result = await readConfig();

    expect(result.vaults).toHaveLength(1);
    expect(result.vaults[0].name).toBe("default");
    expect(result.vaults[0].repoUrl).toBe(legacy.repoUrl);
    expect(result.vaults[0].keyPath).toBe(legacy.keyPath);
    expect(result.vaults[0].vaultPath).toBe(legacy.vaultPath);
  });

  it("persists_migrated_config_to_disk", async () => {
    const legacy = {
      repoUrl: "git@github.com:user/vault.git",
      keyPath: "/home/testuser/.sheltr/key",
      vaultPath: "/home/testuser/.sheltr/vault",
    };
    vol.fromJSON({
      "/home/testuser/.sheltr/config.json": JSON.stringify(legacy),
    });

    await readConfig();

    const raw = vol.readFileSync("/home/testuser/.sheltr/config.json", "utf-8") as string;
    const saved = JSON.parse(raw);
    expect(saved.vaults).toBeDefined();
    expect(saved.repoUrl).toBeUndefined();
  });

  it("throws_when_config_missing_required_vault_fields", async () => {
    vol.fromJSON({
      "/home/testuser/.sheltr/config.json": JSON.stringify({
        vaults: [{ name: "x" }],
      }),
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
      vaults: [
        {
          name: "personal",
          repoUrl: "git@github.com:user/vault.git",
          keyPath: "/home/testuser/.sheltr/vaults/personal/key",
          vaultPath: "/home/testuser/.sheltr/vaults/personal/repo",
        },
      ],
    };

    await writeConfig(config);

    const raw = vol.readFileSync("/home/testuser/.sheltr/config.json", "utf-8") as string;
    expect(JSON.parse(raw)).toEqual(config);
    expect(raw).toContain("\n");
  });
});

describe("resolveVault", () => {
  it("returns_single_vault_without_prompting", async () => {
    const config = {
      vaults: [
        {
          name: "personal",
          repoUrl: "git@github.com:user/vault.git",
          keyPath: "/home/testuser/.sheltr/vaults/personal/key",
          vaultPath: "/home/testuser/.sheltr/vaults/personal/repo",
        },
      ],
    };
    vol.fromJSON({
      "/home/testuser/.sheltr/config.json": JSON.stringify(config),
    });

    const vault = await resolveVault();

    expect(vault.name).toBe("personal");
    expect(vault.repoUrl).toBe("git@github.com:user/vault.git");
  });

  it("throws_when_no_vaults_configured", async () => {
    vol.fromJSON({
      "/home/testuser/.sheltr/config.json": JSON.stringify({ vaults: [] }),
    });

    await expect(resolveVault()).rejects.toThrow("No vaults configured");
  });

  it("returns_vault_by_explicit_name", async () => {
    const config = {
      vaults: [
        {
          name: "personal",
          repoUrl: "git@github.com:user/personal.git",
          keyPath: "/home/testuser/.sheltr/vaults/personal/key",
          vaultPath: "/home/testuser/.sheltr/vaults/personal/repo",
        },
        {
          name: "work",
          repoUrl: "git@github.com:company/work.git",
          keyPath: "/home/testuser/.sheltr/vaults/work/key",
          vaultPath: "/home/testuser/.sheltr/vaults/work/repo",
        },
      ],
    };
    vol.fromJSON({
      "/home/testuser/.sheltr/config.json": JSON.stringify(config),
    });

    const vault = await resolveVault({ vaultName: "work" });

    expect(vault.name).toBe("work");
  });

  it("throws_when_explicit_vault_name_not_found", async () => {
    const config = {
      vaults: [
        {
          name: "personal",
          repoUrl: "git@github.com:user/vault.git",
          keyPath: "/home/testuser/.sheltr/vaults/personal/key",
          vaultPath: "/home/testuser/.sheltr/vaults/personal/repo",
        },
      ],
    };
    vol.fromJSON({
      "/home/testuser/.sheltr/config.json": JSON.stringify(config),
    });

    await expect(resolveVault({ vaultName: "nope" })).rejects.toThrow("not found");
  });

  it("prompts_user_when_multiple_vaults_and_no_project", async () => {
    const config = {
      vaults: [
        {
          name: "personal",
          repoUrl: "git@github.com:user/personal-vault.git",
          keyPath: "/home/testuser/.sheltr/vaults/personal/key",
          vaultPath: "/home/testuser/.sheltr/vaults/personal/repo",
        },
        {
          name: "work",
          repoUrl: "git@github.com:company/work-vault.git",
          keyPath: "/home/testuser/.sheltr/vaults/work/key",
          vaultPath: "/home/testuser/.sheltr/vaults/work/repo",
        },
      ],
    };
    vol.fromJSON({
      "/home/testuser/.sheltr/config.json": JSON.stringify(config),
    });

    vi.doMock("../../ui/prompts.js", () => ({
      askSelect: vi.fn().mockResolvedValue("work"),
    }));

    const { resolveVault: resolveVaultFresh } = await import("../config.js");
    const vault = await resolveVaultFresh();

    expect(vault.name).toBe("work");
  });

  it("auto_selects_vault_containing_project", async () => {
    const config = {
      vaults: [
        {
          name: "personal",
          repoUrl: "git@github.com:user/personal.git",
          keyPath: "/home/testuser/.sheltr/vaults/personal/key",
          vaultPath: "/home/testuser/.sheltr/vaults/personal/repo",
        },
        {
          name: "work",
          repoUrl: "git@github.com:company/work.git",
          keyPath: "/home/testuser/.sheltr/vaults/work/key",
          vaultPath: "/home/testuser/.sheltr/vaults/work/repo",
        },
      ],
    };
    // Create vault dirs with project in "work" vault only
    vol.fromJSON({
      "/home/testuser/.sheltr/config.json": JSON.stringify(config),
      "/home/testuser/.sheltr/vaults/personal/repo/.git/HEAD": "ref: refs/heads/main",
      "/home/testuser/.sheltr/vaults/work/repo/.git/HEAD": "ref: refs/heads/main",
      "/home/testuser/.sheltr/vaults/work/repo/my-app/.env": "SECRET=abc",
    });

    const vault = await resolveVault({ projectName: "my-app" });

    expect(vault.name).toBe("work");
  });
});
