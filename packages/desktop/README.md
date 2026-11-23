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
  "databaseUrl": "postgres://user:pass@host/db",
  "coingeckoApiKey": "CG-…",
  "openBrowser": true
}
```

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
