# Argent desktop

A [Tauri](https://tauri.app) window around the standalone Argent server (`packages/backend/src/standalone`).
The server is bundled as a sidecar executable; it needs no Authentik and no external database. It listens on
`127.0.0.1` only and has a single built-in user.

## Where things live

| What | Linux | macOS | Windows |
| --- | --- | --- | --- |
| Settings (`config.json`) | `$XDG_CONFIG_HOME/argent` or `~/.config/argent` | `~/.config/argent` | `%APPDATA%\Argent` |
| Database | `$XDG_DATA_HOME/argent/db` or `~/.local/share/argent/db` | `~/Library/Application Support/Argent/db` | `%LOCALAPPDATA%\Argent\db` |

Override with `ARGENT_CONFIG_DIR` / `ARGENT_DATA_DIR`, with `"dataDir"` in `config.json`, or (command-line app) `--data-dir`.
`config.json` is created on first start; all keys are optional:

```json
{
  "port": 47821,
  "dataDir": "~/Documents/Argent",
  "backupDir": "~/Backups/Argent",
  "databaseUrl": "postgres://user:pass@host/db",
  "coingeckoApiKey": "CG-…",
  "openBrowser": true
}
```

**Password.** Settings → Security sets a password that locks the app: nobody who opens it sees your numbers until it is entered, and it is asked for again each time the app starts (or after **Lock now**). Only a salted scrypt hash is kept, as `passwordHash` in `config.json`; five wrong guesses block further tries for 30 seconds. It locks the app and its API, not the files: the database in the data folder and the backups are not encrypted, so use disk encryption (FileVault, BitLocker, LUKS) for that. A forgotten password cannot be recovered; delete the `passwordHash` line from `config.json` while the app is closed to remove it.

`backupDir` is where Admin → Backup & Restore → "Back up now" writes its files (default `<dataDir>/backups`); the folder field on that page changes it and keeps it in `config.json` (or `ARGENT_BACKUP_DIR`).
`databaseUrl` replaces the embedded database with your own Postgres server (migrations run on start).
Environment variables win over the file (`ARGENT_PORT`, `ARGENT_DATA_DIR`, `DATABASE_URL`, `COINGECKO_API_KEY`).
`argent --print-paths` shows what is in use. Back up by copying the data directory while Argent is stopped
(or use the Backup tab).

## Build

Needs Rust (stable), Bun and, on Linux, `libwebkit2gtk-4.1-dev` (see the `desktop` job in `.github/workflows/ci.yml`).

```sh
bun install
bun run --cwd packages/frontend build
bun run --cwd packages/desktop bundle     # builds the sidecar for this machine, then the installer
bun run --cwd packages/desktop dev       # a development window
```

Installers end up in `packages/desktop/src-tauri/target/release/bundle/`. Without the window, the same
server is a single file: `bun run --cwd packages/backend build:standalone` → `packages/backend/dist/argent`.
Not done: code signing / notarization (macOS, Windows) and auto-update.

## Installers for every platform (GitHub Actions)

Tauri builds installers only for the system it runs on, so `.github/workflows/desktop.yml` builds on one runner per platform:
Linux (`.deb`, `.rpm`, `.AppImage`), macOS arm64 and Intel (`.dmg`), Windows (`.msi`, `.exe`). `ci.yml` calls it (Linux on pull
requests, all platforms on main; the installers are kept as workflow artifacts). A release needs no manual version bump or tag: run **Release** from the Actions tab (branch `main`, choose patch / minor / major),
or `BUMP=minor mise run release` (needs `gh`). `release.yml` takes the latest `v*` tag, raises it, builds all installers with that
version (written into `tauri.conf.json` on the runner only) and publishes the GitHub release, which creates the tag. Pushing a
`vX.Y.Z` tag by hand also works. The version in the repository files is just a placeholder.

The macOS build is signed ad hoc so it starts on Apple silicon; other Macs still show a Gatekeeper warning until a Developer ID
certificate and notarization are set up. Windows installers are unsigned (SmartScreen warns).
