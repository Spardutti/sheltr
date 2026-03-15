import { beforeEach, describe, expect, it, vi } from "vitest";
import { vol } from "memfs";

vi.mock("node:fs");
vi.mock("node:fs/promises");

import { detectProject, scanEnvFiles } from "../project.js";

beforeEach(() => {
  vol.reset();
});

describe("detectProject", () => {
  it("detects_project_by_package_json", async () => {
    vol.fromJSON(
      { "package.json": "{}", "src/index.ts": "" },
      "/projects/my-app",
    );

    const result = await detectProject("/projects/my-app/src");

    expect(result).toEqual({
      rootPath: "/projects/my-app",
      name: "my-app",
    });
  });

  it("detects_project_by_git_directory", async () => {
    vol.fromJSON(
      { ".git/config": "" },
      "/projects/my-app",
    );

    const result = await detectProject("/projects/my-app");

    expect(result).toEqual({
      rootPath: "/projects/my-app",
      name: "my-app",
    });
  });

  it("returns_null_when_no_markers_found", async () => {
    vol.fromJSON({ "file.txt": "hi" }, "/tmp/random");

    const result = await detectProject("/tmp/random");

    expect(result).toBeNull();
  });
});

describe("scanEnvFiles", () => {
  it("finds_env_files_at_root_and_subdirs", async () => {
    vol.fromJSON(
      {
        ".env": "a",
        "frontend/.env.local": "b",
        "backend/.env": "c",
      },
      "/project",
    );

    const files = await scanEnvFiles("/project");

    expect(files).toEqual([".env", "backend/.env", "frontend/.env.local"]);
  });

  it("excludes_node_modules", async () => {
    vol.fromJSON(
      {
        ".env": "a",
        "node_modules/pkg/.env": "b",
      },
      "/project",
    );

    const files = await scanEnvFiles("/project");

    expect(files).toEqual([".env"]);
  });

  it("returns_empty_when_no_env_files", async () => {
    vol.fromJSON({ "index.js": "" }, "/project");

    const files = await scanEnvFiles("/project");

    expect(files).toEqual([]);
  });
});
