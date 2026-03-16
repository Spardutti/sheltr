import { beforeEach, describe, expect, it, vi } from "vitest";
import { vol } from "memfs";

vi.mock("node:fs");
vi.mock("node:fs/promises");

const { mockExecFile } = vi.hoisted(() => {
  return { mockExecFile: vi.fn() };
});

vi.mock("node:child_process", () => ({
  execFile: mockExecFile,
}));

import { isGitRepo, hasCommits, isVaultCloned, rm } from "../git.js";

beforeEach(() => {
  vol.reset();
  mockExecFile.mockReset();
});

// Helper: make execFile call the callback with success
function mockExecSuccess(stdout = "") {
  mockExecFile.mockImplementation(
    (_cmd: string, _args: string[], _opts: unknown, cb: Function) => {
      cb(null, stdout, "");
    },
  );
}

// Helper: make execFile call the callback with error
function mockExecError(message = "fatal: error") {
  mockExecFile.mockImplementation(
    (_cmd: string, _args: string[], _opts: unknown, cb: Function) => {
      cb(new Error(message), "", message);
    },
  );
}

describe("isGitRepo", () => {
  it("returns_true_when_git_rev_parse_succeeds", async () => {
    mockExecSuccess(".git");

    const result = await isGitRepo("/some/repo");

    expect(result).toBe(true);
    expect(mockExecFile).toHaveBeenCalledWith(
      "git",
      ["rev-parse", "--git-dir"],
      expect.objectContaining({ cwd: "/some/repo" }),
      expect.any(Function),
    );
  });

  it("returns_false_when_git_rev_parse_fails", async () => {
    mockExecError("not a git repo");

    const result = await isGitRepo("/not/a/repo");

    expect(result).toBe(false);
  });
});

describe("hasCommits", () => {
  it("returns_true_when_HEAD_exists", async () => {
    mockExecSuccess("abc123");

    expect(await hasCommits("/repo")).toBe(true);
  });

  it("returns_false_for_empty_repo", async () => {
    mockExecError("fatal: bad default revision 'HEAD'");

    expect(await hasCommits("/repo")).toBe(false);
  });
});

describe("isVaultCloned", () => {
  it("returns_true_when_path_exists_and_is_git_repo", async () => {
    vol.fromJSON({ ".git/config": "" }, "/vault");
    mockExecSuccess(".git");

    const result = await isVaultCloned("/vault");

    expect(result).toBe(true);
  });

  it("returns_false_when_path_does_not_exist", async () => {
    vol.fromJSON({});

    const result = await isVaultCloned("/nonexistent");

    expect(result).toBe(false);
  });

  it("returns_false_when_path_exists_but_not_git_repo", async () => {
    vol.fromJSON({ "file.txt": "" }, "/not-git");
    mockExecError("not a git repo");

    const result = await isVaultCloned("/not-git");

    expect(result).toBe(false);
  });
});

describe("rm", () => {
  it("calls_git_rm_with_files", async () => {
    mockExecSuccess();

    await rm("/repo", ["project/.env", "project/.env.local"]);

    expect(mockExecFile).toHaveBeenCalledWith(
      "git",
      ["rm", "--", "project/.env", "project/.env.local"],
      expect.objectContaining({ cwd: "/repo" }),
      expect.any(Function),
    );
  });

  it("calls_git_rm_with_recursive_flag", async () => {
    mockExecSuccess();

    await rm("/repo", ["project"], true);

    expect(mockExecFile).toHaveBeenCalledWith(
      "git",
      ["rm", "-r", "--", "project"],
      expect.objectContaining({ cwd: "/repo" }),
      expect.any(Function),
    );
  });

  it("throws_on_failure", async () => {
    mockExecError("fatal: pathspec 'nope' did not match any files");

    await expect(rm("/repo", ["nope"])).rejects.toThrow();
  });
});
