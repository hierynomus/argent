# Argent

A self-hosted personal finance app: bank accounts, investments, debts and net worth in one place, on your own
hardware. Run it on a home server or Kubernetes cluster with single sign-on, or install it on your computer as a
desktop app with no accounts and no server.

## What it does

- **Banking**: import CAMT.053 bank statements (duplicates are detected), label transactions, link transfers between
  your own accounts automatically, detect recurring payments as subscriptions.
- **Liabilities**: mortgages and loans in parts (linear, annuity, interest-only), with fixed-rate periods and rate
  changes, extra payments (shorten the term or lower the payment), a first-payment date, and a live preview while you
  enter a part.
- **Investments**: crypto and stocks/ETFs as an immutable trade ledger with FIFO cost basis, realized and unrealized
  P&L, dividends, a cash account per portfolio and price charts; physical metals per lot; property valuations;
  stock options with vesting schedules.
- **Net worth** dashboard across everything, per currency (EUR and USD are never summed).
- **Sharing**: share accounts, portfolios and debts with groups as viewer or editor (server deployment).
- **Backup and restore** of all data as one JSON file.

Prices come from CoinGecko (crypto), Yahoo Finance (stocks, metals futures) and Frankfurter (exchange rates).

## Ways to run it

| | Sign-in | Database | For |
| --- | --- | --- | --- |
| **Desktop app / single executable** | none (one local user, listens on `127.0.0.1` only) | embedded Postgres (PGlite) in your data folder, or your own Postgres | one person on one computer |
| **Server** (containers, Helm chart) | OpenID Connect (Authentik) | PostgreSQL (CloudNativePG or external) | a household or team |
| **Development** | fake user | embedded PGlite | hacking on it |

### Desktop app

Installers (`.dmg`, `.msi`/`.exe`, `.deb`, `.rpm`, `.AppImage`) are built by GitHub Actions and attached to releases.
Settings live in `~/.config/argent/config.json`, data in `~/.local/share/argent` (macOS:
`~/Library/Application Support/Argent`, Windows: `%LOCALAPPDATA%\Argent`). See [`packages/desktop/README.md`](packages/desktop/README.md)
for the settings, backups and building the installers yourself.

Without the window, the same server is one executable: `mise run build:standalone` (or
`bun run --cwd packages/backend build:standalone`), then `packages/backend/dist/argent`.

### Server

Container images (`docker/`) run as a non-root user on a read-only file system, and the Helm chart in
[`charts/argent`](charts/argent/README.md) deploys them with a CloudNativePG database, a Traefik IngressRoute or a
standard Ingress, cert-manager and optional network policies. You need an OIDC provider (the app is written for
Authentik): create a public client with the redirect URI `https://<host>/auth/callback`.

```sh
helm install argent ./charts/argent --namespace argent --create-namespace \
  --set host=finance.example.com \
  --set auth.issuer=https://authentik.example.com/application/o/argent \
  --set auth.clientId=<client id>
```

The chart has been linted and rendered in CI but not yet run on a real cluster; expect to adjust values.

## Development

You need [Bun](https://bun.sh); [mise](https://mise.jdx.dev) can install the tools for you (`mise.toml`).

```sh
bun install
mise run dev          # backend on :3000 and frontend on :5173, no external services needed
# or
bun run dev:backend   # first: cp packages/backend/.env.example packages/backend/.env.development
bun run dev:frontend  #        cp packages/frontend/.env.example packages/frontend/.env.development
```

The development database is embedded and keeps its data in `packages/backend/.data`; `bun run db:reset` empties it.

| Command | |
| --- | --- |
| `bun run check` | type-check everything, run all tests (backend, frontend, shared, five time zones) and check the migrations |
| `bun run check:chart` | lint and render the Helm chart (needs `helm`) |
| `mise run build:desktop` | desktop installer for this machine (needs Rust and the Tauri system libraries) |
| `scripts/smoke-standalone.sh`, `scripts/smoke-images.sh` | start the built executable / container images and check them |

`mise tasks` lists everything else. Architecture notes and conventions are in [`CLAUDE.md`](CLAUDE.md); the backlog is
in [`TODO.md`](TODO.md).

## Layout

```
packages/shared     types and zod schemas, shared by backend and frontend
packages/backend    Hono + Drizzle + PostgreSQL API (also the standalone server)
packages/frontend   Vue 3 + Vite + Tailwind single-page app
packages/desktop    Tauri shell around the standalone server
charts/argent       Helm chart
docker/             Dockerfiles, nginx config
```
