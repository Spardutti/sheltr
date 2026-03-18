import { beforeEach, describe, expect, it, vi } from "vitest";
import { vol } from "memfs";

vi.mock("node:fs");
vi.mock("node:fs/promises");

import {
  ensureGitattributes,
  copyEnvFilesToVault,
  listVaultProjects,
  listVaultFiles,
  copyFilesFromVault,
  fileExists,
  filesMatch,
  removeVaultProject,
  detectVaultLayout,
  getProjectDir,
  getVaultFilePath,
  getProjectDirRelative,
  migrateVaultLayout,
  ENV_PREFIX,
} from "../vault.js";

beforeEach(() => {
  vol.reset();
});

describe("ensureGitattributes", () => {
  it("creates_gitattributes_with_modern_rule_when_missing", async () => {
    vol.mkdirSync("/vault", { recursive: true });

    const created = await ensureGitattributes("/vault");

    expect(created).toBe(true);
    const content = vol.readFileSync("/vault/.gitattributes", "utf-8");
    expect(content).toContain("_env/**/.env* filter=git-crypt diff=git-crypt");
  });

  it("skips_when_modern_rule_already_exists", async () => {
    vol.fromJSON(
      { ".gitattributes": "_env/**/.env* filter=git-crypt diff=git-crypt\n" },
      "/vault",
    );

    const created = await ensureGitattributes("/vault");

    expect(created).toBe(false);
  });

  it("appends_modern_rule_to_existing_gitattributes", async () => {
    vol.fromJSON(
      { ".gitattributes": "*.txt text\n" },
      "/vault",
    );

    const created = await ensureGitattributes("/vault");

    expect(created).toBe(true);
    const content = vol.readFileSync("/vault/.gitattributes", "utf-8") as string;
    expect(content).toContain("*.txt text");
    expect(content).toContain("_env/**/.env* filter=git-crypt diff=git-crypt");
  });
});

describe("detectVaultLayout", () => {
  it("returns_modern_when_env_prefix_dir_has_contents", async () => {
    vol.fromJSON(
      {
        "_env/my-app/.env": "SECRET",
        ".git/config": "",
      },
      "/vault",
    );

    expect(await detectVaultLayout("/vault")).toBe("modern");
  });

  it("returns_legacy_when_projects_at_root", async () => {
    vol.fromJSON(
      {
        "my-app/.env": "SECRET",
        ".git/config": "",
      },
      "/vault",
    );

    expect(await detectVaultLayout("/vault")).toBe("legacy");
  });

  it("returns_modern_for_empty_vault", async () => {
    vol.fromJSON(
      { ".git/config": "" },
      "/vault",
    );

    expect(await detectVaultLayout("/vault")).toBe("modern");
  });
});

describe("getProjectDir", () => {
  it("returns_env_prefixed_path_for_modern_layout", () => {
    expect(getProjectDir("/vault", "my-app", "modern")).toBe("/vault/_env/my-app");
  });

  it("returns_root_path_for_legacy_layout", () => {
    expect(getProjectDir("/vault", "my-app", "legacy")).toBe("/vault/my-app");
  });

  it("defaults_to_modern_layout", () => {
    expect(getProjectDir("/vault", "my-app")).toBe("/vault/_env/my-app");
  });
});

describe("getVaultFilePath", () => {
  it("returns_full_path_for_modern_layout", () => {
    expect(getVaultFilePath("/vault", "my-app", ".env", "modern")).toBe("/vault/_env/my-app/.env");
  });

  it("returns_full_path_for_legacy_layout", () => {
    expect(getVaultFilePath("/vault", "my-app", ".env", "legacy")).toBe("/vault/my-app/.env");
  });
});

describe("getProjectDirRelative", () => {
  it("returns_env_prefixed_relative_for_modern", () => {
    expect(getProjectDirRelative("my-app", "modern")).toBe("_env/my-app");
  });

  it("returns_project_name_for_legacy", () => {
    expect(getProjectDirRelative("my-app", "legacy")).toBe("my-app");
  });
});

describe("copyEnvFilesToVault", () => {
  it("copies_files_to_vault_under_env_prefix", async () => {
    vol.fromJSON(
      {
        ".env": "DUMMY_CONTENT",
        "config/.env.local": "DUMMY_LOCAL",
      },
      "/project",
    );
    vol.mkdirSync("/vault", { recursive: true });

    const paths = await copyEnvFilesToVault(
      "/project",
      "my-app",
      "/vault",
      [".env", "config/.env.local"],
    );

    expect(paths).toEqual(["_env/my-app/.env", "_env/my-app/config/.env.local"]);
    expect(vol.existsSync("/vault/_env/my-app/.env")).toBe(true);
    expect(vol.existsSync("/vault/_env/my-app/config/.env.local")).toBe(true);
  });
});

describe("listVaultProjects", () => {
  it("returns_projects_from_env_prefix_for_modern_layout", async () => {
    vol.fromJSON(
      {
        ".git/config": "",
        "_env/beta/.env": "",
        "_env/alpha/.env": "",
      },
      "/vault",
    );

    const projects = await listVaultProjects("/vault");

    expect(projects).toEqual(["alpha", "beta"]);
  });

  it("returns_projects_from_root_for_legacy_layout", async () => {
    vol.fromJSON(
      {
        ".git/config": "",
        "beta/.env": "",
        "alpha/.env": "",
      },
      "/vault",
    );

    const projects = await listVaultProjects("/vault");

    expect(projects).toEqual(["alpha", "beta"]);
  });

  it("returns_empty_array_when_vault_has_no_projects", async () => {
    vol.fromJSON(
      {
        ".git/config": "",
        ".gitattributes": "rule",
      },
      "/vault",
    );

    const projects = await listVaultProjects("/vault");

    expect(projects).toEqual([]);
  });
});

describe("listVaultFiles", () => {
  it("returns_sorted_env_files_from_modern_layout", async () => {
    vol.fromJSON(
      {
        "_env/my-app/.env": "a",
        "_env/my-app/.env.local": "b",
        "_env/my-app/sub/.env.prod": "c",
        ".git/config": "",
      },
      "/vault",
    );

    const files = await listVaultFiles("/vault", "my-app");

    expect(files).toEqual([".env", ".env.local", "sub/.env.prod"]);
  });

  it("returns_sorted_env_files_from_legacy_layout", async () => {
    vol.fromJSON(
      {
        "my-app/.env": "a",
        "my-app/.env.local": "b",
        ".git/config": "",
      },
      "/vault",
    );

    const files = await listVaultFiles("/vault", "my-app");

    expect(files).toEqual([".env", ".env.local"]);
  });

  it("returns_empty_when_no_env_files", async () => {
    vol.fromJSON(
      {
        "_env/my-app/readme.md": "hi",
        ".git/config": "",
      },
      "/vault",
    );

    const files = await listVaultFiles("/vault", "my-app");

    expect(files).toEqual([]);
  });
});

describe("copyFilesFromVault", () => {
  it("copies_files_from_modern_vault_to_project", async () => {
    vol.fromJSON(
      {
        "_env/my-app/.env": "VAULT_DATA",
        "_env/my-app/sub/.env.local": "VAULT_LOCAL",
        ".git/config": "",
      },
      "/vault",
    );
    vol.mkdirSync("/project", { recursive: true });

    await copyFilesFromVault("/vault", "my-app", "/project", [".env", "sub/.env.local"]);

    expect(vol.existsSync("/project/.env")).toBe(true);
    expect(vol.existsSync("/project/sub/.env.local")).toBe(true);
  });

  it("copies_files_from_legacy_vault_to_project", async () => {
    vol.fromJSON(
      {
        "my-app/.env": "VAULT_DATA",
        ".git/config": "",
      },
      "/vault",
    );
    vol.mkdirSync("/project", { recursive: true });

    await copyFilesFromVault("/vault", "my-app", "/project", [".env"]);

    expect(vol.existsSync("/project/.env")).toBe(true);
  });
});

describe("fileExists", () => {
  it("returns_true_when_file_exists", async () => {
    vol.fromJSON({ "/tmp/test": "data" });

    expect(await fileExists("/tmp/test")).toBe(true);
  });

  it("returns_false_when_file_missing", async () => {
    vol.fromJSON({});

    expect(await fileExists("/tmp/nope")).toBe(false);
  });
});

describe("filesMatch", () => {
  it("returns_true_for_identical_files", async () => {
    const content = Buffer.from([0x01, 0x02, 0x03, 0xff]);
    vol.fromJSON({});
    vol.writeFileSync("/a", content);
    vol.writeFileSync("/b", content);

    expect(await filesMatch("/a", "/b")).toBe(true);
  });

  it("returns_false_for_different_files", async () => {
    vol.fromJSON({});
    vol.writeFileSync("/a", Buffer.from([0x01]));
    vol.writeFileSync("/b", Buffer.from([0x02]));

    expect(await filesMatch("/a", "/b")).toBe(false);
  });

  it("returns_false_for_different_lengths", async () => {
    vol.fromJSON({});
    vol.writeFileSync("/a", Buffer.from([0x01, 0x02]));
    vol.writeFileSync("/b", Buffer.from([0x01]));

    expect(await filesMatch("/a", "/b")).toBe(false);
  });
});

describe("removeVaultProject", () => {
  it("removes_project_from_modern_layout", async () => {
    vol.fromJSON(
      {
        "_env/my-app/.env": "SECRET",
        "_env/other-app/.env": "KEEP",
        ".git/config": "",
      },
      "/vault",
    );

    await removeVaultProject("/vault", "my-app");

    expect(vol.existsSync("/vault/_env/my-app")).toBe(false);
    expect(vol.existsSync("/vault/_env/other-app/.env")).toBe(true);
  });

  it("removes_project_from_legacy_layout", async () => {
    vol.fromJSON(
      {
        "my-app/.env": "SECRET",
        "other-app/.env": "KEEP",
      },
      "/vault",
    );

    await removeVaultProject("/vault", "my-app");

    expect(vol.existsSync("/vault/my-app")).toBe(false);
    expect(vol.existsSync("/vault/other-app/.env")).toBe(true);
  });

  it("does_not_throw_when_project_does_not_exist", async () => {
    vol.fromJSON({ ".git/config": "" }, "/vault");

    await expect(removeVaultProject("/vault", "nonexistent")).resolves.toBeUndefined();
  });
});

describe("migrateVaultLayout", () => {
  it("moves_projects_from_root_to_env_prefix", async () => {
    vol.fromJSON(
      {
        ".git/config": "",
        ".gitattributes": ".env* filter=git-crypt diff=git-crypt\n",
        "my-app/.env": "SECRET",
        "other-app/.env": "OTHER",
      },
      "/vault",
    );

    const result = await migrateVaultLayout("/vault");

    expect(result.migrated).toEqual(["my-app", "other-app"]);
    expect(vol.existsSync("/vault/_env/my-app/.env")).toBe(true);
    expect(vol.existsSync("/vault/_env/other-app/.env")).toBe(true);
    expect(vol.existsSync("/vault/my-app")).toBe(false);
    expect(vol.existsSync("/vault/other-app")).toBe(false);
  });

  it("removes_legacy_rule_and_keeps_modern_rule", async () => {
    vol.fromJSON(
      {
        ".git/config": "",
        ".gitattributes": ".env* filter=git-crypt diff=git-crypt\n",
        "my-app/.env": "SECRET",
      },
      "/vault",
    );

    await migrateVaultLayout("/vault");

    const content = vol.readFileSync("/vault/.gitattributes", "utf-8") as string;
    expect(content).toContain("_env/**/.env* filter=git-crypt diff=git-crypt");
    expect(content).not.toContain("\n.env* filter=git-crypt diff=git-crypt");
  });

  it("returns_empty_array_when_already_modern", async () => {
    vol.fromJSON(
      {
        ".git/config": "",
        "_env/my-app/.env": "SECRET",
      },
      "/vault",
    );

    const result = await migrateVaultLayout("/vault");

    expect(result.migrated).toEqual([]);
  });
});
