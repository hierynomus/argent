# CLAUDE.md

Self-hosted personal finance app. Repo dir is `finance`, but the root package is `argent` and workspace packages are `@argent/*`.

## Stack
- Bun workspaces monorepo: `packages/shared` (`@argent/shared`: types + zod request schemas, also used by the frontend for validation), `packages/backend` (Hono + Drizzle + Postgres), `packages/frontend` (React + Vite + Tailwind + react-oidc-context).
- Auth: Authentik OIDC. The SPA runs the auth code flow; the backend validates the Bearer JWT via JWKS (`jose`).
- Deploy: Docker images (`docker/`), k8s manifests (`k8s/`) for k3s/RKE2 with Traefik IngressRoute, cert-manager, CloudNativePG. Migrations run as a k8s init container.
- CI: `.github/workflows/ci.yml` runs `bun run check` and the frontend build.

## Commands
- `bun install && bun run db:generate`, then `bun run dev:backend` and `bun run dev:frontend`. No external services are needed locally.
- `bun run db:generate`: generate a migration from `schema.ts` changes.
- `bun run db:migrate`: apply migrations.
- `bun run --cwd packages/backend db:check`: exits 1 if `schema.ts` has drifted from the committed migrations. Run before pushing schema changes.
- **`bun run check`**: the one command to run before finishing work. Type-checks all three packages (test files included), runs every test, and verifies migrations match `schema.ts`.
- `bun run typecheck` / `bun run test`: the two halves separately. Per package: `bun run --cwd packages/<name> test|typecheck`.
- `bun run build`: build all packages.

## Local dev mode
- Backend `.env.development`: `AUTH_MODE=fake` injects a static dev user. With `DATABASE_URL` unset it uses PGlite (in-memory Postgres WASM) and auto-migrates.
- Frontend `.env.development`: `VITE_AUTH_MODE=fake` uses `FakeAuthProvider`, which feeds the real `AuthContext`, so `useAuth()` works unchanged.
- PGlite is a devDependency and is not in the production image.

## Database / migrations (important)
- Drizzle migrations in `packages/backend/drizzle/` (currently 0000–0018) are tracked in git. Never gitignore them.
- Run `db:generate` BEFORE editing `schema.ts`, or restart the backend after generating. Bun `--hot` restarts on `schema.ts` changes, and PGlite can end up on a stale schema.
- Always create migrations with `db:generate` (0018 was generated this way). Don't hand-write them without also updating `drizzle/meta/` snapshots and the journal. Drift makes `db:generate` hang on an interactive rename prompt. Check with `db:check`.

## Backend layout (`packages/backend/src`)
- `app.ts`: `createApp({ auth?, logRequests? })` builds the Hono app (all routes under `/api`: `me`, `accounts`, `categories`, `transactions`, `import`, `subscriptions`, `admin`, `crypto`, `metals`, `stocks`, `mortgages`, `loans`) plus the JSON `onError`/`notFound` handlers. `index.ts` only starts the server and the background jobs. Tests use `createApp` directly.
- `middleware/validate.ts`: `validateJson(schema)` validates the body against a schema from `@argent/shared` and answers `400 { error, issues }`; handlers then read `c.req.valid("json")`. **Every route that reads a JSON body must use it** (schemas live in `packages/shared/src/schemas.ts`; the `*Body` types in `types.ts` are derived from them with `z.input`).
- `services/backgroundJobs.ts`: `runBackgroundJobs(trigger)` = link transfers, THEN detect subscriptions, queued sequentially with errors logged. Used after imports, on startup and periodically. Don't fire `linkTransfers()`/`detectSubscriptions()` ad hoc and un-awaited.
- `middleware/auth.ts`: JWT middleware, plus `syncProfileOnce` (Map keyed by sub, iat-based).
- `services/accessControl.ts`: one generic resolver over "owned or shared with a group" resources (accounts, portfolios, mortgages, loans). Use `toAccessContext(user)` to build the context, `canView*`/`canEdit*` for single-resource checks, and `getViewable*Ids`/`getEditable*Ids` for lists. Add new shared resource types by defining a `SharedResource` there.
- `services/camt053.ts`: CAMT.053 parser. Dedup uses a SHA-256 `import_hash` (globally unique) over amount+currency+date+counterpartyIban+reference+description. **Known gap:** it excludes the account and the debit/credit direction (see `TODO.md`).
- `services/transferLinker.ts`: links internal transfers by shared EndToEndId or by counterpartyIban matching an own account. Never links two legs on the same account.
- `services/subscriptionDetector.ts`: detects recurring DBIT patterns, grouped by `(accountId, counterpartyIban)`. Gaps must be within ±20% of the median (floor ±5 days) and amounts within ±5%. New ones are created as `candidate`. Existing `candidate`/`confirmed` rows only get their stats updated, and `dismissed` pairs are skipped. Manual `POST /subscriptions` creates `confirmed` and retroactively links transactions. Dismiss unlinks transactions and leaves a `dismissed` tombstone. Links are write-time via `transactions.subscriptionId`. Each detection pass first unlinks transactions that became transfers and removes `candidate`s left empty (confirmed ones are kept).
- `services/fifo.ts`: `computeFifo(trades, symbol, baseCurrency)` returns `{ balance, avgCostBasis, totalCostEur, realizedPnL }`. Shared by crypto and stocks.
- `services/priceService.ts`: CoinGecko (crypto), metals.live + Frankfurter (metals), Yahoo Finance + Frankfurter (stocks/ETFs). 5-min in-process cache.
- `services/amortization.ts`: `computePartState(part, payments, asOf)` simulates month by month for linear/annuity/interest_only parts with extra payments. Shared by mortgages and loans.

## Testing (`bun test`)
- Backend tests live next to the code (`*.test.ts`) and run on in-memory PGlite. `test/setup.ts` (a `bunfig.toml` preload) forces `DATABASE_URL=memory` and installs `test/fakeFetch.ts`, so **no test can touch a real database or the network**.
- All test files in a run share one database (one process), so tests create their own uniquely-named data and assert only on it, never on global counts. `test/helpers.ts` has `api/get/post/...` (real app as the fake admin), `clientAs(user(...))` (real app as any user/role), `camt(...)` (CAMT.053 builder), `upload(...)` (waits for background jobs to settle).
- `bun run check` also runs the shared (`schemas.test.ts`) and frontend (`lib/format.test.ts`) tests.
- Modules with in-process caches (priceService) are loaded fresh per test with `import("./x.ts?fresh=N")`.
- Backup/restore replaces ALL data, which is fine inside the suite because the round trip restores what it backed up.

## Domain models
- **Crypto and stocks**: immutable trade ledger plus FIFO. `stock_trades` has the same shape as `crypto_trades`. The stocks API takes `{type: "buy"|"sell", symbol, quantity, amount}` and translates it to from/to. Crypto also supports swaps, with `baseCurrencyAmount` auto-computed by FIFO cost-transfer. Stock dividends (`stock_dividends`) sit outside the FIFO chain and are deletable.
- **Metals**: per-lot physical inventory with no FIFO. `metal_lots` plus immutable `metal_sales`.
- **Mortgages and loans**: identical structures (`*_parts`, `*_extra_payments`, `*_members`). The `mortgages` and `loans` routes and pages mirror each other, so change both together.
- **Accounts**: `type` is checking or savings. `balance` is computed as `openingBalance` plus the sum of transactions since `openingBalanceDate`.
- Portfolios: `portfolios(type: crypto|metals|stocks, currency: EUR|USD, broker)`. `broker` is stocks-only.

## RBAC
- Global, from the JWT `groups` claim: `AUTHENTIK_ADMIN_GROUP` is admin and `AUTHENTIK_IMPORT_GROUP` can import (admins can too). The code defaults are `argent-admin` / `argent-import`, but `.env.development` sets `finance-admin`. Always set both explicitly.
- Per-resource roles (accounts, portfolios, mortgages, loans) live in `*_members(…, groupName, role)` with role `viewer` or `editor`. The owner (or an admin) manages members and deletion.
- No user table. Users and groups live in Authentik. `user_profiles` only caches email, name and theme.
- Importing a new IBAN creates the account with no access, and an admin assigns groups later. Importing an existing IBAN requires editor access, otherwise 403.

## Frontend layout (`packages/frontend/src`)
Pages are thin: they pick a feature and pass configuration. Real UI lives in `features/<area>/` and shared pieces in `components/`.
- `api/`: the only place that talks HTTP. `client.ts` (`http.get/post/...`, `ApiError`, token getter set by `ApiAuthBridge`), one module per domain (`accounts`, `transactions`, `admin`, …), **generic factories** `portfolioApis` (crypto/metals/stocks) and `debtApis` (mortgages/loans), `keys.ts` (every query key) and `queries.ts` (read hooks + `useInvalidate`). **Never pass a token, never write `useQuery({ queryKey: [...] })` or `invalidateQueries({ queryKey: [...] })` in a page** — add a hook/key in `api/` so a resource has one key and refreshes everywhere. Keys are hierarchical (e.g. everything transaction-related is under `["transactions"]`).
- `components/ui/`: primitives — `Button` (type="button" by default), `Input`/`Select` (`density`), `Field` (associates label↔control, shows `error`), `FieldGroup`, `SegmentedControl`, `ConfirmButton` (inline confirm; never use `window.confirm/alert`), `RoleBadge`, `LoadingText/ErrorText/EmptyState`, `cx`. `components/SharingPanel.tsx`, `components/Pagination.tsx` are shared widgets.
- `features/debts/` (`DebtPage` serves both Mortgages and Loans via `DEBT_KINDS`), `features/portfolios/` (`PortfolioPage` shell + `crypto/`, `stocks/`, `metals/` views), `features/transactions/`, `features/subscriptions/`, `features/dashboard/` (`summarize.ts` is the pure net-worth logic), `features/admin/`, `features/settings/`, `features/import/`, `features/accounts/`.
- Forms validate with the **same zod schemas the backend uses**: build the request body, `check(schema, body)` from `useFormErrors()` (`lib/validate.ts`), show `errors.<field>` via `<Field error=…>`, and only then `mutate()`.
- `lib/format.ts`: all number/currency/date/P&L formatting. Don't define `fmt*` helpers inside components.
- Pages are lazy-loaded in `App.tsx` (`AppRoutes` is exported for tests). `/transactions` redirects to `/overview`.
- `auth.ts` reads OIDC config from `window.__ENV__`. In production, `docker/env.sh` (nginx entrypoint) writes it to `/env-config.js` so one image works in every environment.
- `components/Layout.tsx`: collapsible sidebar with sections Banking, Liabilities, Investments, and Admin/Profile.
- Frontend `tsconfig` has `noUnusedLocals` on. Test files are type-checked separately (`tsconfig.test.json`).

## Frontend testing (`bun test` in `packages/frontend`)
- happy-dom + Testing Library (`test/setup.ts` preload). `renderApp(ui, { route })` from `test/render.tsx` wraps auth (fake), `ApiAuthBridge`, query client and a `MemoryRouter`.
- The API is faked at the `fetch` level: `mockApi({ "GET /x": data, "POST /x/:id": ({ body, params }) => … })` (`test/fakeApi.ts`); assert with `api.calls("POST", "/x")` and `api.unmatched` (requests nobody mocked). Because tests go through the real network layer, they survive refactors of `src/api/`.
- `test/fixtures.ts` has fixtures typed against `@argent/shared`; `test/dom.ts#field(label)` finds a control by label text.
- The token getter in `api/client.ts` is module-level state: tests that set it must reset it.
- Run in random order (`bun test --randomize`) when touching shared test state.

## Env vars
- Backend: `DATABASE_URL`, `AUTHENTIK_ISSUER`, `CORS_ORIGIN`, `AUTHENTIK_ADMIN_GROUP`, `AUTHENTIK_IMPORT_GROUP`.
- Frontend: `VITE_AUTHENTIK_AUTHORITY`, `VITE_AUTHENTIK_CLIENT_ID`.

## Open deployment TODOs
- Replace the `your-registry/finance-*` image refs and `finance.example.com` in `k8s/`.
- Create the Authentik OIDC app with a public client and redirect URI `https://<domain>/auth/callback`.
- The CloudNativePG operator, cert-manager and a `letsencrypt` ClusterIssuer must exist before applying `k8s/postgres.yaml` and `k8s/ingress.yaml`.
