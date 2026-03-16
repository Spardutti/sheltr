# Sheltr

**Your `.env` files, encrypted and git-synced. No SaaS, no secrets lost.**

---

Every developer has lost a `.env` file. A dead laptop, a fresh clone, a new machine — and suddenly your project won't start because the secrets are gone. You ping a teammate, dig through Slack, or worse — you just don't have them anymore.

Sheltr fixes this. It stores your `.env` files in a **private Git repo you own**, encrypted with **AES-256 via git-crypt**. Push from one machine, pull from another. No third-party servers. No subscriptions. Just your repo, your key, your secrets.

```bash
npx @spardutti/sheltr setup    # one-time setup
npx @spardutti/sheltr push     # encrypt and store your .env files
npx @spardutti/sheltr pull     # restore them anywhere
```

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

Paste your vault's **SSH URL** (e.g. `git@github.com:you/env-vault.git`), then generate or import an encryption key.

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
| `npx @spardutti/sheltr setup` | One-time setup — connect vault repo, configure encryption key |
| `npx @spardutti/sheltr push` | Encrypt and push `.env` files to the vault |
| `npx @spardutti/sheltr pull` | Pull and restore `.env` files from the vault |
| `npx @spardutti/sheltr status` | Compare local vs vault — shows `in sync`, `out of sync`, `local only`, `vault only` |
| `npx @spardutti/sheltr list` | List all projects stored in the vault |
| `npx @spardutti/sheltr delete` | Remove a project from the vault (requires typed confirmation) |
| `npx @spardutti/sheltr key export` | Export your key as base64 (for password manager backup) |
| `npx @spardutti/sheltr key import <base64>` | Restore your key from a base64 string |

### Push with a custom message

```bash
npx @spardutti/sheltr push -m "added stripe keys"
```

### Pull a specific project

```bash
npx @spardutti/sheltr pull my-other-app
```

### Check sync status

```bash
npx @spardutti/sheltr status
```

```
ℹ Project: my-app

  .env                           in sync
  .env.local                     out of sync — run sheltr push or pull
  .env.test                      local only
```

---

## Requirements

- **Node.js 18+**
- **Git**
- **git-crypt** — Sheltr will offer to install it for you during setup

---

## Security

| Layer | Detail |
|-------|--------|
| **Encryption** | AES-256 via git-crypt |
| **What's encrypted** | All `.env` file contents |
| **What's visible** | Project and folder names in the vault repo |
| **Key storage** | Local file at `~/.sheltr/key` (permissions `0400`) |
| **Config** | `~/.sheltr/config.json` (permissions `0600`, never uploaded) |
| **If your vault leaks** | `.env` contents remain encrypted — unreadable without the key |

### Key Backup

**Your git-crypt key is the only way to decrypt your vault.** If you lose it, your encrypted `.env` files are unrecoverable.

Export your key as a base64 string and save it in a password manager:

```bash
npx @spardutti/sheltr key export
```

To restore it on a new machine:

```bash
npx @spardutti/sheltr key import <base64-string>
```

---

## Setting Up Another Machine

1. Run `npx @spardutti/sheltr key import <base64-string>` (grab the string from your password manager)
2. Run `npx @spardutti/sheltr setup`
3. Choose **"Import an existing key"**
4. Point to `~/.sheltr/key`

That's it. All your projects and `.env` files are available immediately.

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

## License

MIT
