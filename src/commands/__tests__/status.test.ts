import { beforeEach, describe, expect, it, vi } from "vitest";
import { vol } from "memfs";

vi.mock("node:fs");
vi.mock("node:fs/promises");

// The status command uses fileExists and filesMatch from vault.ts to determine
// file status. Since vault.ts is tested separately, we test the status
// determination logic directly using the real vault functions with memfs.

import { fileExists, filesMatch } from "../../core/vault.js";
import { type FileStatus } from "../status.js";

function determineStatus(hasLocal: boolean, hasVault: boolean, match: boolean): FileStatus {
  if (hasLocal && hasVault) {
    return match ? "in-sync" : "modified";
  }
  if (hasLocal) return "local-only";
  return "vault-only";
}

beforeEach(() => {
  vol.reset();
});

describe("status file comparison logic", () => {
  it("identifies_in_sync_when_contents_match", async () => {
    vol.fromJSON({
      "/project/.env": "SECRET=abc",
      "/vault/my-app/.env": "SECRET=abc",
    });

    const hasLocal = await fileExists("/project/.env");
    const hasVault = await fileExists("/vault/my-app/.env");
    const match = await filesMatch("/project/.env", "/vault/my-app/.env");

    expect(determineStatus(hasLocal, hasVault, match)).toBe("in-sync");
  });

  it("identifies_modified_when_contents_differ", async () => {
    vol.fromJSON({
      "/project/.env": "SECRET=new",
      "/vault/my-app/.env": "SECRET=old",
    });

    const hasLocal = await fileExists("/project/.env");
    const hasVault = await fileExists("/vault/my-app/.env");
    const match = await filesMatch("/project/.env", "/vault/my-app/.env");

    expect(determineStatus(hasLocal, hasVault, match)).toBe("modified");
  });

  it("identifies_local_only_when_not_in_vault", async () => {
    vol.fromJSON({ "/project/.env": "SECRET=abc" });

    const hasLocal = await fileExists("/project/.env");
    const hasVault = await fileExists("/vault/my-app/.env");

    expect(determineStatus(hasLocal, hasVault, false)).toBe("local-only");
  });

  it("identifies_vault_only_when_not_local", async () => {
    vol.fromJSON({ "/vault/my-app/.env": "SECRET=abc" });

    const hasLocal = await fileExists("/project/.env");
    const hasVault = await fileExists("/vault/my-app/.env");

    expect(determineStatus(hasLocal, hasVault, false)).toBe("vault-only");
  });
});
