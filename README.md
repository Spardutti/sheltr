# Sheltr

Your `.env` files, encrypted and git-synced. No SaaS, no secrets lost.

Sheltr is a CLI that stores your `.env` files in a private Git repo encrypted with [git-crypt](https://github.com/AGWA/git-crypt). You own your data, your repo, and your encryption key.

## Why Sheltr?

- **Laptop dies?** Your `.env` files are safe in your encrypted vault repo.
- **Multiple machines?** `sheltr pull` on any machine with the key.
- **Monorepos?** Sheltr detects all `.env` files across your project.
- **No SaaS?** Everything stays in your own private Git repo. No third-party servers.

## Quick Start

```bash
# 1. Create an empty private repo on GitHub/GitLab (your vault)

# 2. Set up sheltr
npx sheltr setup

# 3. Push your .env files
npx sheltr push

# 4. On another machine, pull them back
npx sheltr pull
```

## Requirements

- Node.js 18+
- Git
- [git-crypt](https://github.com/AGWA/git-crypt) (sheltr will offer to install it during setup)

## Commands

### `sheltr setup`

First-time setup. Clones your vault repo and configures encryption.

- **New vault:** generates a git-crypt key and initializes encryption
- **Existing vault:** imports your key file and unlocks the repo

```bash
sheltr setup
```

### `sheltr push`

Detects your project, scans for `.env` files, and pushes them to the vault.

```bash
sheltr push                    # auto-detect project
sheltr push -m "added stripe"  # custom commit message
```

### `sheltr pull`

Pulls `.env` files from the vault into your project. Handles conflicts per-file (overwrite, backup, or skip).

```bash
sheltr pull             # auto-detect project
sheltr pull my-app      # specify project name
```

### `sheltr status`

Shows sync status between local `.env` files and the vault.

```bash
sheltr status
```

Each file is labeled: `in sync`, `modified`, `local only`, or `vault only`.

### `sheltr list`

Lists all projects stored in the vault with their file counts.

```bash
sheltr list
```

### `sheltr delete`

Removes a project's `.env` files from the vault. Requires typing the project name to confirm.

```bash
sheltr delete             # auto-detect or pick from list
sheltr delete my-app      # specify project name
```

## How It Works

```
your-projects/                    your-vault-repo (private, encrypted)
  my-app/                           my-app/
    .env           -- push -->         .env        (encrypted by git-crypt)
    .env.local     <-- pull --         .env.local  (encrypted by git-crypt)
  other-project/                     other-project/
    .env                               .env
```

1. Sheltr uses a **separate private Git repo** as your vault (not your project repo)
2. `.env` file contents are encrypted with **AES-256 via git-crypt** before being committed
3. Project and folder names are **not encrypted** -- only file contents are
4. Everything uses standard Git operations -- you get version history for free

## Security

| Layer | Detail |
|-------|--------|
| Encryption | AES-256 via git-crypt |
| What's encrypted | All `.env` file contents |
| What's visible | Project/folder names in the vault repo |
| Key storage | Local file at `~/.sheltr/key` (permissions `0400`) |
| Config | `~/.sheltr/config.json` (permissions `0600`, never uploaded) |
| Repo exposure | If your vault repo leaks, `.env` contents remain encrypted blobs |

### Key Backup

**Your git-crypt key is the only way to decrypt your vault.** Back it up to a password manager or other secure location. If you lose it, your encrypted `.env` files are unrecoverable.

The key is saved to `~/.sheltr/key` during setup.

### Setting Up Another Machine

1. Copy your key file to the new machine
2. Run `sheltr setup`
3. Choose "Import an existing key"
4. Point to the key file

## Project Detection

Sheltr walks up from your current directory looking for project root markers:

- `.git`
- `package.json`
- `pyproject.toml`
- `Cargo.toml`
- `go.mod`
- `composer.json`

If none are found, it asks whether to use the current folder name.

## Configuration

Config is stored at `~/.sheltr/config.json`:

```json
{
  "repoUrl": "git@github.com:you/env-vault.git",
  "keyPath": "/home/you/.sheltr/key",
  "vaultPath": "/home/you/.sheltr/vault"
}
```

## License

MIT
