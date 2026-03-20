import { beforeEach, describe, expect, it, vi } from "vitest";
import { vol } from "memfs";

vi.mock("node:fs");
vi.mock("node:fs/promises");

import {
  readManifest,
  writeManifest,
  resolveStoreName,
  detectSecret,
  validateFileSize,
  copyFileToStore,
  listStoreFiles,
  removeFromStore,
  ensureSecretsGitattributes,
  restoreFileFromStore,
  formatFileSize,
  getStoreDir,
  STORE_DIRS,
} from "../store.js";

import type { Manifest } from "../store.js";

beforeEach(() => {
  vol.reset();
});

describe("STORE_DIRS", () => {
  it("has_correct_directory_names", () => {
    expect(STORE_DIRS.files).toBe("_files");
    expect(STORE_DIRS.secrets).toBe("_secrets");
  });
});

describe("getStoreDir", () => {
  it("returns_files_store_path", () => {
    expect(getStoreDir("/vault", "files")).toBe("/vault/_files");
  });

  it("returns_secrets_store_path", () => {
    expect(getStoreDir("/vault", "secrets")).toBe("/vault/_secrets");
  });
});

describe("readManifest", () => {
  it("returns_empty_manifest_when_file_missing", async () => {
    vol.mkdirSync("/vault", { recursive: true });

    const manifest = await readManifest("/vault", "files");

    expect(manifest).toEqual({ files: [] });
  });

  it("reads_existing_manifest", async () => {
    const data: Manifest = {
      files: [{ name: ".bashrc", originalPath: "/home/user/.bashrc" }],
    };
    vol.fromJSON(
      { "_files/manifest.json": JSON.stringify(data) },
      "/vault",
    );

    const manifest = await readManifest("/vault", "files");

    expect(manifest.files).toHaveLength(1);
    expect(manifest.files[0].name).toBe(".bashrc");
    expect(manifest.files[0].originalPath).toBe("/home/user/.bashrc");
  });
});

describe("writeManifest", () => {
  it("creates_store_dir_and_writes_manifest", async () => {
    vol.mkdirSync("/vault", { recursive: true });

    const manifest: Manifest = {
      files: [{ name: "config.toml", originalPath: "/home/user/.config/config.toml" }],
    };

    await writeManifest("/vault", "files", manifest);

    const content = vol.readFileSync("/vault/_files/manifest.json", "utf-8") as string;
    const parsed = JSON.parse(content);
    expect(parsed.files).toHaveLength(1);
    expect(parsed.files[0].name).toBe("config.toml");
  });

  it("writes_to_secrets_store", async () => {
    vol.mkdirSync("/vault", { recursive: true });

    const manifest: Manifest = {
      files: [{ name: "id_rsa", originalPath: "/home/user/.ssh/id_rsa" }],
    };

    await writeManifest("/vault", "secrets", manifest);

    expect(vol.existsSync("/vault/_secrets/manifest.json")).toBe(true);
  });
});

describe("resolveStoreName", () => {
  it("returns_basename_when_no_collision", () => {
    const manifest: Manifest = { files: [] };

    expect(resolveStoreName(".bashrc", manifest)).toBe(".bashrc");
  });

  it("suffixes_with_dash_2_on_first_collision", () => {
    const manifest: Manifest = {
      files: [{ name: "config", originalPath: "/a/config" }],
    };

    expect(resolveStoreName("config", manifest)).toBe("config-2");
  });

  it("increments_suffix_for_multiple_collisions", () => {
    const manifest: Manifest = {
      files: [
        { name: "config", originalPath: "/a/config" },
        { name: "config-2", originalPath: "/b/config" },
      ],
    };

    expect(resolveStoreName("config", manifest)).toBe("config-3");
  });

  it("handles_files_with_extensions", () => {
    const manifest: Manifest = {
      files: [{ name: "starship.toml", originalPath: "/a/starship.toml" }],
    };

    expect(resolveStoreName("starship.toml", manifest)).toBe("starship-2.toml");
  });
});

describe("detectSecret", () => {
  it("detects_pem_extension", async () => {
    vol.fromJSON({ "/tmp/cert.pem": "cert content" });

    expect(await detectSecret("/tmp/cert.pem")).toBe(true);
  });

  it("detects_key_extension", async () => {
    vol.fromJSON({ "/tmp/server.key": "key content" });

    expect(await detectSecret("/tmp/server.key")).toBe(true);
  });

  it("detects_id_rsa_filename", async () => {
    vol.fromJSON({ "/tmp/id_rsa": "ssh key" });

    expect(await detectSecret("/tmp/id_rsa")).toBe(true);
  });

  it("detects_npmrc_filename", async () => {
    vol.fromJSON({ "/tmp/.npmrc": "//registry.npmjs.org/:_authToken=xyz" });

    expect(await detectSecret("/tmp/.npmrc")).toBe(true);
  });

  it("detects_begin_private_key_content", async () => {
    vol.fromJSON({ "/tmp/mykey": "-----BEGIN PRIVATE KEY-----\nMIIE..." });

    expect(await detectSecret("/tmp/mykey")).toBe(true);
  });

  it("detects_ssh_rsa_content", async () => {
    vol.fromJSON({ "/tmp/pubkey": "ssh-rsa AAAAB3NzaC1yc2EAAAADAQAB..." });

    expect(await detectSecret("/tmp/pubkey")).toBe(true);
  });

  it("returns_false_for_normal_file", async () => {
    vol.fromJSON({ "/tmp/.bashrc": "export PATH=$PATH:/usr/local/bin" });

    expect(await detectSecret("/tmp/.bashrc")).toBe(false);
  });
});

describe("validateFileSize", () => {
  it("returns_ok_for_small_file", async () => {
    vol.fromJSON({ "/tmp/small": "hello" });

    const { result } = await validateFileSize("/tmp/small");

    expect(result).toBe("ok");
  });

  it("returns_warn_for_file_over_1MB", async () => {
    vol.mkdirSync("/tmp", { recursive: true });
    vol.writeFileSync("/tmp/medium", Buffer.alloc(1.5 * 1024 * 1024));

    const { result } = await validateFileSize("/tmp/medium");

    expect(result).toBe("warn");
  });

  it("returns_block_for_file_over_10MB", async () => {
    vol.mkdirSync("/tmp", { recursive: true });
    vol.writeFileSync("/tmp/large", Buffer.alloc(11 * 1024 * 1024));

    const { result } = await validateFileSize("/tmp/large");

    expect(result).toBe("block");
  });
});

describe("copyFileToStore", () => {
  it("copies_file_to_store_directory", async () => {
    vol.fromJSON({ "/home/user/.bashrc": "export PATH=$PATH" });
    vol.mkdirSync("/vault", { recursive: true });

    const manifest: Manifest = { files: [] };
    const { storeName, entry } = await copyFileToStore("/home/user/.bashrc", "/vault", "files", manifest);

    expect(storeName).toBe(".bashrc");
    expect(entry.originalPath).toBe("/home/user/.bashrc");
    expect(vol.existsSync("/vault/_files/.bashrc")).toBe(true);
    expect(vol.readFileSync("/vault/_files/.bashrc", "utf-8")).toBe("export PATH=$PATH");
  });

  it("resolves_collision_with_suffix", async () => {
    vol.fromJSON({ "/home/user/project-b/config": "new config" });
    vol.mkdirSync("/vault/_files", { recursive: true });

    const manifest: Manifest = {
      files: [{ name: "config", originalPath: "/home/user/project-a/config" }],
    };

    const { storeName } = await copyFileToStore("/home/user/project-b/config", "/vault", "files", manifest);

    expect(storeName).toBe("config-2");
    expect(vol.existsSync("/vault/_files/config-2")).toBe(true);
  });

  it("reuses_name_when_same_original_path", async () => {
    vol.fromJSON({ "/home/user/.bashrc": "updated content" });
    vol.mkdirSync("/vault/_files", { recursive: true });

    const manifest: Manifest = {
      files: [{ name: ".bashrc", originalPath: "/home/user/.bashrc" }],
    };

    const { storeName } = await copyFileToStore("/home/user/.bashrc", "/vault", "files", manifest);

    expect(storeName).toBe(".bashrc");
  });
});

describe("listStoreFiles", () => {
  it("returns_manifest_entries", async () => {
    const data: Manifest = {
      files: [
        { name: ".bashrc", originalPath: "/home/user/.bashrc" },
        { name: "starship.toml", originalPath: "/home/user/.config/starship.toml" },
      ],
    };
    vol.fromJSON(
      { "_files/manifest.json": JSON.stringify(data) },
      "/vault",
    );

    const entries = await listStoreFiles("/vault", "files");

    expect(entries).toHaveLength(2);
    expect(entries[0].name).toBe(".bashrc");
    expect(entries[1].name).toBe("starship.toml");
  });

  it("returns_empty_array_when_no_manifest", async () => {
    vol.mkdirSync("/vault", { recursive: true });

    const entries = await listStoreFiles("/vault", "files");

    expect(entries).toEqual([]);
  });
});

describe("removeFromStore", () => {
  it("removes_file_and_updates_manifest", async () => {
    const data: Manifest = {
      files: [
        { name: ".bashrc", originalPath: "/home/user/.bashrc" },
        { name: "config.toml", originalPath: "/home/user/config.toml" },
      ],
    };
    vol.fromJSON(
      {
        "_files/manifest.json": JSON.stringify(data),
        "_files/.bashrc": "content",
        "_files/config.toml": "content",
      },
      "/vault",
    );

    const updated = await removeFromStore("/vault", "files", ".bashrc");

    expect(updated.files).toHaveLength(1);
    expect(updated.files[0].name).toBe("config.toml");
    expect(vol.existsSync("/vault/_files/.bashrc")).toBe(false);
  });

  it("handles_missing_file_gracefully", async () => {
    const data: Manifest = {
      files: [{ name: "gone", originalPath: "/tmp/gone" }],
    };
    vol.fromJSON(
      { "_files/manifest.json": JSON.stringify(data) },
      "/vault",
    );

    const updated = await removeFromStore("/vault", "files", "gone");

    expect(updated.files).toHaveLength(0);
  });
});

describe("ensureSecretsGitattributes", () => {
  it("creates_gitattributes_with_secrets_rule", async () => {
    vol.mkdirSync("/vault", { recursive: true });

    const modified = await ensureSecretsGitattributes("/vault");

    expect(modified).toBe(true);
    const content = vol.readFileSync("/vault/.gitattributes", "utf-8");
    expect(content).toContain("_secrets/** filter=git-crypt diff=git-crypt");
  });

  it("skips_when_rule_already_exists", async () => {
    vol.fromJSON(
      { ".gitattributes": "_secrets/** filter=git-crypt diff=git-crypt\n" },
      "/vault",
    );

    const modified = await ensureSecretsGitattributes("/vault");

    expect(modified).toBe(false);
  });

  it("appends_rule_to_existing_gitattributes", async () => {
    vol.fromJSON(
      { ".gitattributes": "_env/**/.env* filter=git-crypt diff=git-crypt\n" },
      "/vault",
    );

    const modified = await ensureSecretsGitattributes("/vault");

    expect(modified).toBe(true);
    const content = vol.readFileSync("/vault/.gitattributes", "utf-8") as string;
    expect(content).toContain("_env/**/.env* filter=git-crypt diff=git-crypt");
    expect(content).toContain("_secrets/** filter=git-crypt diff=git-crypt");
  });
});

describe("restoreFileFromStore", () => {
  it("copies_file_from_store_to_destination", async () => {
    vol.fromJSON(
      { "_files/.bashrc": "export PATH=$PATH" },
      "/vault",
    );
    vol.mkdirSync("/home/user", { recursive: true });

    const entry = { name: ".bashrc", originalPath: "/home/user/.bashrc" };
    await restoreFileFromStore(entry, "/vault", "files", "/home/user/.bashrc");

    expect(vol.existsSync("/home/user/.bashrc")).toBe(true);
    expect(vol.readFileSync("/home/user/.bashrc", "utf-8")).toBe("export PATH=$PATH");
  });

  it("creates_parent_directory_if_missing", async () => {
    vol.fromJSON(
      { "_files/starship.toml": "[prompt]" },
      "/vault",
    );

    const entry = { name: "starship.toml", originalPath: "/home/user/.config/starship.toml" };
    await restoreFileFromStore(entry, "/vault", "files", "/home/user/.config/starship.toml");

    expect(vol.existsSync("/home/user/.config/starship.toml")).toBe(true);
  });

  it("works_with_secrets_store", async () => {
    vol.fromJSON(
      { "_secrets/id_rsa": "ssh key content" },
      "/vault",
    );

    const entry = { name: "id_rsa", originalPath: "/home/user/.ssh/id_rsa" };
    await restoreFileFromStore(entry, "/vault", "secrets", "/home/user/.ssh/id_rsa");

    expect(vol.existsSync("/home/user/.ssh/id_rsa")).toBe(true);
  });
});

describe("formatFileSize", () => {
  it("formats_bytes", () => {
    expect(formatFileSize(500)).toBe("500 B");
  });

  it("formats_kilobytes", () => {
    expect(formatFileSize(2048)).toBe("2.0 KB");
  });

  it("formats_megabytes", () => {
    expect(formatFileSize(5 * 1024 * 1024)).toBe("5.0 MB");
  });
});
