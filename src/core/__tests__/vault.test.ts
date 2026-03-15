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
} from "../vault.js";

beforeEach(() => {
  vol.reset();
});

describe("ensureGitattributes", () => {
  it("creates_gitattributes_when_missing", async () => {
    vol.mkdirSync("/vault", { recursive: true });

    const created = await ensureGitattributes("/vault");

    expect(created).toBe(true);
    const content = vol.readFileSync("/vault/.gitattributes", "utf-8");
    expect(content).toContain(".env* filter=git-crypt diff=git-crypt");
  });

  it("skips_when_rule_already_exists", async () => {
    vol.fromJSON(
      { ".gitattributes": ".env* filter=git-crypt diff=git-crypt\n" },
      "/vault",
    );

    const created = await ensureGitattributes("/vault");

    expect(created).toBe(false);
  });

  it("appends_rule_to_existing_gitattributes", async () => {
    vol.fromJSON(
      { ".gitattributes": "*.txt text\n" },
      "/vault",
    );

    const created = await ensureGitattributes("/vault");

    expect(created).toBe(true);
    const content = vol.readFileSync("/vault/.gitattributes", "utf-8") as string;
    expect(content).toContain("*.txt text");
    expect(content).toContain(".env* filter=git-crypt diff=git-crypt");
  });
});

describe("copyEnvFilesToVault", () => {
  it("copies_files_to_vault_project_directory", async () => {
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

    expect(paths).toEqual(["my-app/.env", "my-app/config/.env.local"]);
    expect(vol.existsSync("/vault/my-app/.env")).toBe(true);
    expect(vol.existsSync("/vault/my-app/config/.env.local")).toBe(true);
  });
});

describe("listVaultProjects", () => {
  it("returns_sorted_project_directories_excluding_git", async () => {
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
  it("returns_sorted_env_files_recursively", async () => {
    vol.fromJSON(
      {
        ".env": "a",
        ".env.local": "b",
        "sub/.env.prod": "c",
      },
      "/vault/my-app",
    );

    const files = await listVaultFiles("/vault", "my-app");

    expect(files).toEqual([".env", ".env.local", "sub/.env.prod"]);
  });

  it("returns_empty_when_no_env_files", async () => {
    vol.fromJSON({ "readme.md": "hi" }, "/vault/my-app");

    const files = await listVaultFiles("/vault", "my-app");

    expect(files).toEqual([]);
  });
});

describe("copyFilesFromVault", () => {
  it("copies_files_from_vault_to_project", async () => {
    vol.fromJSON(
      { ".env": "VAULT_DATA", "sub/.env.local": "VAULT_LOCAL" },
      "/vault/my-app",
    );
    vol.mkdirSync("/project", { recursive: true });

    await copyFilesFromVault("/vault", "my-app", "/project", [".env", "sub/.env.local"]);

    expect(vol.existsSync("/project/.env")).toBe(true);
    expect(vol.existsSync("/project/sub/.env.local")).toBe(true);
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
  it("removes_project_directory_and_all_contents", async () => {
    vol.fromJSON(
      {
        "my-app/.env": "SECRET",
        "my-app/sub/.env.local": "LOCAL",
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
