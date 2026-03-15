import { beforeEach, describe, expect, it, vi } from "vitest";
import { vol } from "memfs";

vi.mock("node:fs");
vi.mock("node:fs/promises");

const { mockExecFile, mockSpawn } = vi.hoisted(() => {
  return {
    mockExecFile: vi.fn(),
    mockSpawn: vi.fn(),
  };
});

vi.mock("node:child_process", () => ({
  execFile: mockExecFile,
  spawn: mockSpawn,
}));

vi.mock("../../ui/prompts.js", () => ({
  askConfirm: vi.fn(),
}));

vi.mock("../../ui/logger.js", () => ({
  log: {
    info: vi.fn(),
    warn: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
  },
}));

import { initCrypt, exportKey, unlockVault, importKey } from "../crypt.js";

beforeEach(() => {
  vol.reset();
  mockExecFile.mockReset();
  mockSpawn.mockReset();
});

function mockExecSuccess(stdout = "") {
  mockExecFile.mockImplementation(
    (_cmd: string, _args: string[], _opts: unknown, cb: Function) => {
      cb(null, stdout, "");
    },
  );
}

function mockExecError(message = "fatal: error") {
  mockExecFile.mockImplementation(
    (_cmd: string, _args: string[], _opts: unknown, cb: Function) => {
      cb(new Error(message), "", message);
    },
  );
}

describe("initCrypt", () => {
  it("runs_git_crypt_init_in_vault", async () => {
    mockExecSuccess();

    await initCrypt("/vault");

    expect(mockExecFile).toHaveBeenCalledWith(
      "git-crypt",
      ["init"],
      { cwd: "/vault" },
      expect.any(Function),
    );
  });

  it("throws_on_failure", async () => {
    mockExecError("git-crypt init failed");

    await expect(initCrypt("/vault")).rejects.toThrow();
  });
});

describe("exportKey", () => {
  it("runs_git_crypt_export_key", async () => {
    // exportKey calls chmod on the key file after export, so it must exist
    vol.fromJSON({ "/vault/key": "" });
    mockExecSuccess();

    await exportKey("/vault", "/vault/key");

    expect(mockExecFile).toHaveBeenCalledWith(
      "git-crypt",
      ["export-key", "/vault/key"],
      { cwd: "/vault" },
      expect.any(Function),
    );
  });
});

describe("unlockVault", () => {
  it("runs_git_crypt_unlock_with_key", async () => {
    mockExecSuccess();
    vol.fromJSON({ "/keys/vault.key": "keydata" });

    await unlockVault("/vault", "/keys/vault.key");

    expect(mockExecFile).toHaveBeenCalledWith(
      "git-crypt",
      ["unlock", "/keys/vault.key"],
      { cwd: "/vault" },
      expect.any(Function),
    );
  });

  it("throws_when_key_file_does_not_exist", async () => {
    vol.fromJSON({});

    await expect(unlockVault("/vault", "/missing/key")).rejects.toThrow("Key file not found");
  });
});

describe("importKey", () => {
  it("copies_key_to_destination", async () => {
    vol.fromJSON({ "/source/key": "keydata" });
    vol.mkdirSync("/dest", { recursive: true });
    mockExecSuccess();

    await importKey("/source/key", "/dest/key");

    expect(vol.existsSync("/dest/key")).toBe(true);
  });

  it("throws_when_source_does_not_exist", async () => {
    vol.fromJSON({});

    await expect(importKey("/missing/key", "/dest/key")).rejects.toThrow("Key file not found");
  });
});
