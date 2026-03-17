# Sheltr

**Your `.env` files, encrypted and git-synced. No SaaS, no secrets lost.**

---

Every developer has lost a `.env` file. A dead laptop, a fresh clone, a new machine — and suddenly your project won't start because the secrets are gone. You ping a teammate, dig through Slack, or worse — you just don't have them anymore.

Sheltr fixes this. It stores your `.env` files in a **private Git repo you own**, encrypted with **AES-256 via git-crypt**. Push from one machine, pull from another. No third-party servers. No subscriptions. Just your repo, your key, your secrets.

Designed for **solo developers** and **personal use across multiple machines**. Can also be used by small, trusted teams. Supports **multiple vaults** — keep personal and work secrets separate.

**Step 1:** Create an empty private repo on GitHub/GitLab — this is your encrypted vault.

**Step 2:** Run sheltr:

```bash
npx @spardutti/sheltr setup    # one-time setup (connects to your vault repo)
npx @spardutti/sheltr push     # encrypt and store your .env files
npx @spardutti/sheltr pull     # restore them anywhere
```

**Tip:** add an alias to skip typing the full package name every time:

```bash
# bash
echo 'alias sheltr="npx @spardutti/sheltr"' >> ~/.bashrc

# zsh
echo 'alias sheltr="npx @spardutti/sheltr"' >> ~/.zshrc
```

Then just use `sheltr push`, `sheltr pull`, etc.

---

## How It Works

```
your-project/                         your-vault-repo/ (private, encrypted)
│                                     │
├── .env             ── push ──►      ├── my-app/
├── .env.local       ◄── pull ──      │   ├── .env          (AES-256 encrypted)
│                                     │   └── .env.local    (AES-256 encrypted)
├── frontend/                         │
│   └── .env         ── push ──►      ├── my-app/frontend/
│                                     │   └── .env          (AES-256 encrypted)
└── src/                              │
    └── index.ts                      └── .gitattributes
```

1. **You create a separate private repo** — this is your vault, not your project repo
2. **Sheltr encrypts `.env` contents** with git-crypt before committing — values are unreadable without your key
3. **Folder structure is preserved** — monorepo with 10 `.env` files? All of them, in the right place
4. **Git history is your version control** — every push is a commit, roll back anytime

> Even if your vault repo goes public, the `.env` contents are encrypted blobs. Only machines with your key can read them.

---

## Quick Start

### 1. Create an empty private repo

Go to GitHub or GitLab and create a new **empty private repo** (no README, no .gitignore). This is your vault.

### 2. Set up Sheltr

```bash
npx @spardutti/sheltr setup
```

Paste your vault's **SSH URL** (e.g. `git@github.com:you/env-vault.git`), give it a name (e.g. `personal`), then generate or import an encryption key.

### 3. Push your secrets

```bash
cd my-project
npx @spardutti/sheltr push
```

Sheltr detects your project, finds all `.env` files, lets you pick which ones to store, encrypts them, and pushes to your vault.

### 4. Pull them on another machine

```bash
npx @spardutti/sheltr pull
```

Your `.env` files are restored to the exact paths they came from. If a file already exists locally, Sheltr **automatically creates a backup** before overwriting.

---

## Commands

| Command | What it does |
|---------|-------------|
| `sheltr setup` | Connect a vault repo and configure encryption key |
| `sheltr push` | Encrypt and push `.env` files to the vault |
| `sheltr pull` | Pull and restore `.env` files from the vault |
| `sheltr status` | Compare local vs vault — shows sync status |
| `sheltr list` | List all projects across all vaults |
| `sheltr delete` | Remove a project from the vault |
| `sheltr move` | Move a project from one vault to another |
| `sheltr vault list` | List all configured vaults |
| `sheltr vault remove` | Remove a vault configuration |
| `sheltr key export` | Export your key as base64 (for backup) |
| `sheltr key import <base64>` | Restore your key from a base64 string |

### Push with a custom message

```bash
sheltr push -m "added stripe keys"
```

### Pull a specific project

```bash
sheltr pull my-other-app
```

### Target a specific vault

All commands that operate on a vault accept `--vault <name>` to skip auto-detection:

```bash
sheltr push --vault work
sheltr pull --vault personal
sheltr status --vault work
sheltr key export --vault personal
```

### Check sync status

```bash
sheltr status
```

```
ℹ Using vault: personal
ℹ Project: my-app

  .env                           in sync
  .env.local                     out of sync — run sheltr push or pull
  .env.test                      local only
```

---

## Multiple Vaults

Sheltr supports multiple vaults — for example, a personal vault and a shared work vault, each with its own repo and encryption key.

### Add a second vault

```bash
sheltr setup
```

If you already have a vault configured, Sheltr shows your existing vaults and asks if you want to add a new one. Give it a name (e.g. `work`), paste the repo URL, and set up the key.

### How vault selection works

Sheltr picks the right vault automatically:

| Scenario | What happens |
|----------|-------------|
| Only 1 vault configured | Auto-selects it, no prompt |
| Project exists in exactly 1 vault | Auto-selects that vault |
| Project is new (first push) | Asks you to pick a vault |
| `--vault <name>` flag used | Uses that vault directly |

### List your vaults

```bash
sheltr vault list
```

```
  personal  git@github.com:you/env-vault.git
  work      git@github.com:company/team-vault.git
```

### Move a project between vaults

```bash
sheltr move my-app --from personal --to work
```

Or run `sheltr move` interactively — it walks you through selecting the source vault, project, and destination vault.

### Remove a vault

```bash
sheltr vault remove work
```

Requires typed confirmation. Optionally deletes local files (with a key loss warning).

---

## Requirements

- **Node.js 18+**
- **Git**
- **git-crypt** — Sheltr will offer to install it for you during setup

### Platform Support

| Platform | Supported |
|----------|-----------|
| **Linux** | Yes |
| **macOS** | Yes |
| **Windows (WSL)** | Yes |
| **Windows native** | No — git-crypt has no official Windows support |

Windows users: install [WSL](https://learn.microsoft.com/en-us/windows/wsl/install) and run Sheltr from there.

---

## Security

| Layer | Detail |
|-------|--------|
| **Encryption** | AES-256 via git-crypt |
| **What's encrypted** | All `.env` file contents |
| **What's visible** | Project and folder names in the vault repo |
| **Key storage** | Per-vault key at `~/.sheltr/vaults/<name>/key` (permissions `0400`) |
| **Config** | `~/.sheltr/config.json` (permissions `0600`, never uploaded) |
| **If your vault leaks** | `.env` contents remain encrypted — unreadable without the key |

### Key Backup

**Your git-crypt key is the only way to decrypt your vault.** If you lose it, your encrypted `.env` files are unrecoverable. Each vault has its own key.

Export your key as a base64 string and save it in a password manager:

```bash
sheltr key export                    # single vault
sheltr key export --vault work       # specific vault
```

To restore it on a new machine:

```bash
sheltr key import <base64-string>
```

---

## Setting Up Another Machine

1. Run `sheltr key import <base64-string>` (grab the string from your password manager)
2. Run `sheltr setup`
3. Choose **"Import an existing key"**
4. Point to `~/.sheltr/vaults/<name>/key`

That's it. All your projects and `.env` files are available immediately. Repeat for each vault you need access to.

---

## Project Detection

Sheltr automatically detects your project by walking up from the current directory looking for:

`.git` · `package.json` · `pyproject.toml` · `Cargo.toml` · `go.mod` · `composer.json`

Works with any language or framework. Monorepos with nested `.env` files are fully supported.

---

## Why not Doppler / dotenv-vault / 1Password?

| | Sheltr | SaaS tools |
|---|---|---|
| **Where are secrets stored?** | Your own private Git repo | Their servers |
| **Encryption** | AES-256, you hold the key | They hold the key |
| **Cost** | Free forever | Free tier → paid |
| **Vendor lock-in** | None — it's just Git | Full |
| **Works offline** | Yes | No |
| **Setup time** | 2 minutes | Account creation, team setup, integrations |

---

## Using Sheltr with a Team

Sheltr can work for small, trusted teams. Teammates need **two things** to access a vault:

1. **Collaborator access** to the private vault repo on GitHub/GitLab
2. **The encryption key** to decrypt `.env` contents

Without both, they can't do anything — repo access alone shows encrypted blobs, and the key alone is useless without the repo.

**Adding a teammate:**
1. Invite them as a collaborator on your vault repo (GitHub → Settings → Collaborators)
2. Share the encryption key securely (password manager, in person, or encrypted message — never over Slack/email in plaintext)
3. They run `sheltr key import <base64>` then `sheltr setup` and choose "Import an existing key"

**Removing a teammate:**
1. Remove them as a collaborator on the vault repo — they can no longer pull or push
2. Rotate any sensitive secrets (API keys, DB passwords, etc.) — standard practice when anyone leaves a project, with or without Sheltr

> This is no different from normal development. Any dev with project access already has `.env` files on their machine. Sheltr doesn't make revocation harder or easier — the real action is always rotating the secrets themselves.

**With multiple vaults**, you can share a work vault with your team while keeping a personal vault private. Each vault has its own key, so sharing one doesn't expose the other.

**Limitations:**
- Single shared key per vault — no per-user permissions
- Everyone with access sees all projects in that vault
- No audit logs

For teams that need access control, user revocation, or audit trails, use a dedicated secrets manager like Doppler or 1Password. Sheltr is built for simplicity and ownership, not enterprise access management.

---

## License

MIT
