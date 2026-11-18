# CLAUDE.md

Self-hosted personal finance app. Repo dir is `finance`, but the root package is `argent` and workspace packages are `@argent/*`.

## Stack
- Bun workspaces monorepo: `packages/shared` (`@argent/shared`: types + zod request schemas, also used by the frontend for validation), `packages/backend` (Hono + Drizzle + Postgres), `packages/frontend` (Vue 3 + Vite + Tailwind + vue-router + TanStack Query for Vue + oidc-client-ts).
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
- Frontend `.env.development`: `VITE_AUTH_MODE=fake` uses `createFakeAuth()`, which is the same `Auth` object the real OIDC flow produces, so `useAuth()` works unchanged.
- PGlite is a devDependency and is not in the production image.

## Database / migrations (important)
- Drizzle migrations in `packages/backend/drizzle/` (currently 0000–0022) are tracked in git. Never gitignore them.
- Run `db:generate` BEFORE editing `schema.ts`, or restart the backend after generating. Bun `--hot` restarts on `schema.ts` changes, and PGlite can end up on a stale schema.
- Always create migrations with `db:generate` (0018 was generated this way). Don't hand-write them without also updating `drizzle/meta/` snapshots and the journal. Drift makes `db:generate` hang on an interactive rename prompt. Check with `db:check`.

## Backend layout (`packages/backend/src`)
- `app.ts`: `createApp({ auth?, logRequests? })` builds the Hono app (all routes under `/api`: `me`, `accounts`, `categories`, `transactions`, `import`, `subscriptions`, `admin`, `crypto`, `metals`, `stocks`, `mortgages`, `loans`) plus the JSON `onError`/`notFound` handlers. `index.ts` only starts the server and the background jobs. Tests use `createApp` directly.
- `middleware/validate.ts`: `validateJson(schema)` validates the body against a schema from `@argent/shared` and answers `400 { error, issues }`; handlers then read `c.req.valid("json")`. **Every route that reads a JSON body must use it** (schemas live in `packages/shared/src/schemas.ts`; the `*Body` types in `types.ts` are derived from them with `z.input`).
- `services/backgroundJobs.ts`: `runBackgroundJobs(trigger)` = link transfers, THEN detect subscriptions, queued sequentially with errors logged. Used after imports, on startup and periodically. Don't fire `linkTransfers()`/`detectSubscriptions()` ad hoc and un-awaited.
- `config.ts`: `loadConfig()` validates the environment once at startup (fake auth refused and group names/CORS required in production); read settings from `config`, not `process.env`.
- `middleware/guards.ts`: `requireAdmin` (admin router) and `isOwnerOrAdmin(resource, user)` (owner-only actions on shared resources) — don't write these checks inline.
- `middleware/auth.ts`: JWT middleware, plus `syncProfileOnce` (Map keyed by sub, iat-based).
- `services/accessControl.ts`: one generic resolver over "owned or shared with a group" resources (accounts, portfolios, mortgages, loans). Use `toAccessContext(user)` to build the context, `canView*`/`canEdit*` for single-resource checks, and `getViewable*Ids`/`getEditable*Ids` for lists. Add new shared resource types by defining a `SharedResource` there.
- `services/camt053.ts`: CAMT.053 parser. Dedup uses a SHA-256 `import_hash` (globally unique) from `computeImportHash`: account IBAN, debit/credit direction, amount (normalised to 2 decimals), currency, date, counterpartyIban, reference, description. Migration 0019 recomputes stored hashes in SQL from the same columns; `routes/importHash.test.ts` checks the SQL and the TS agree, so change both together. Identical entries on the *same* account still collapse (inherent to a content hash).
- `services/transferLinker.ts`: links internal transfers by shared EndToEndId or by counterpartyIban matching an own account. Never links two legs on the same account.
- `services/subscriptionDetector.ts`: detects recurring DBIT patterns, grouped by `(accountId, counterpartyIban)`. Gaps must be within ±20% of the median (floor ±5 days) and amounts within ±5%. New ones are created as `candidate`. Existing `candidate`/`confirmed` rows only get their stats updated, and `dismissed` pairs are skipped. Manual `POST /subscriptions` creates `confirmed` and retroactively links transactions. Dismiss unlinks transactions and leaves a `dismissed` tombstone. Links are write-time via `transactions.subscriptionId`. Each detection pass first unlinks transactions that became transfers and removes `candidate`s left empty (confirmed ones are kept).
- `services/fifo.ts`: `computeFifo(trades, symbol, baseCurrency)` returns `{ balance, avgCostBasis, totalCostEur, realizedPnL }`. Shared by crypto and stocks.
- `services/priceService.ts`: CoinGecko (crypto: ~35 pinned tickers; any other ticker is resolved by CoinGecko search, best market-cap rank wins, cached; prices at full precision in one batched call via `getCryptoPrices`), metals.live + Frankfurter (metals), Yahoo Finance + Frankfurter (stocks/ETFs). 5-min in-process cache. `getCryptoHistory`/`getStockHistory` (CoinGecko `market_chart`, Yahoo chart ranges; downsampled, 15-min cache) feed `GET /crypto|stocks/history/:symbol?range=1m|3m|6m|1y|max&currency=EUR|USD` (validated with `validateQuery(historyQuerySchema)`; empty `points` when unknown). Stock history converts at today's FX rate. CoinGecko's key-less API is heavily rate limited: `coingecko()` honours 429/`retry-after` (no calls while blocked), crypto prices and history fall back to Yahoo's `SYM-EUR`/`SYM-USD` pairs, stale prices (<24 h) and history (<7 d) are served while a provider is down, identical in-flight history requests are shared, and `PriceProviderError` (→ HTTP 503 on the history route) separates "try later" from "unknown symbol". An optional `COINGECKO_API_KEY` (free demo key) raises the limit.
- `services/amortization.ts`: `computePartState(part, payments, asOf)` simulates month by month for linear/annuity/interest_only parts with extra payments. Shared by mortgages and loans. A part's `rateType` is `nominal` (monthly rate = rate/12, the default) or `effective` (monthly = (1+rate)^(1/12)-1); banks often quote the effective rate. Payment m is due m months after `startDate` on the same day of the month (day-aware: `monthsElapsed` counts payments whose date has passed). There is no stub period, so set the start date one month before the first installment. Extra payments take effect on their own date (the interest of that period drops in proportion to the days left) and the payment size stays, so they shorten the term: `monthsRemaining`/`projectedEndDate` are the projection, `totalMonths` is the schedule.

## Testing (`bun test`)
- Backend tests live next to the code (`*.test.ts`) and run on in-memory PGlite. `test/setup.ts` (a `bunfig.toml` preload) forces `DATABASE_URL=memory` and installs `test/fakeFetch.ts`, so **no test can touch a real database or the network**.
- All test files in a run share one database (one process), so tests create their own uniquely-named data and assert only on it, never on global counts. `test/helpers.ts` has `api/get/post/...` (real app as the fake admin), `clientAs(user(...))` (real app as any user/role), `camt(...)` (CAMT.053 builder), `upload(...)` (waits for background jobs to settle).
- `bun run check` also runs the shared (`schemas.test.ts`) and all frontend tests.
- Modules with in-process caches (priceService) are loaded fresh per test with `import("./x.ts?fresh=N")`.
- Backup/restore replaces ALL data, which is fine inside the suite because the round trip restores what it backed up.

## Domain models
- **Crypto and stocks**: immutable trade ledger plus FIFO. `stock_trades` has the same shape as `crypto_trades`. The stocks API takes `{type: "buy"|"sell", symbol, quantity, amount}` and translates it to from/to. Crypto also supports swaps, with `baseCurrencyAmount` auto-computed by FIFO cost-transfer. Stock dividends (`stock_dividends`) sit outside the FIFO chain and are deletable.
- **Metals**: per-lot physical inventory with no FIFO. `metal_lots` plus immutable `metal_sales`.
- **Property** (`properties`, `property_valuations`, `property_members`, `property_mortgages`, `property_loans`): anything with a value but no ledger (house, apartment, land, vehicle, business, other). Value = dated, **manually entered valuations**; the latest one dated today or earlier counts, flat until the next (`services/property.ts#currentValueOf`; else the purchase price; else unknown). A property can be linked to mortgages/loans (FK link tables, cascade both ways) so `debt` = their current balances (`getLiabilities`, only ones the user can view) and `equity` = value − debt. `GET /properties` is the read model (no GET /:id); `PUT /:id/links` only touches links to liabilities the user can see. Net worth counts the property as an asset and the linked mortgage stays a liability.
- **Equity compensation / stock options** (`equity_plans`, `equity_grants`, `equity_prices`, `equity_plan_members`): one plan per company holding its grants. A grant vests either **over time** (`vestStart`, `cliffMonths`, `vestMonths`; monthly after the cliff, day-aware, `services/equity.ts#vestedOptions`) or **on exit** only; a plan that is partly both is two grants. Share prices are manual and dated (latest dated today or earlier counts, flat until the next). Value per option = max(0, price − strike). **Only the vested value of time-vested grants counts in net worth**; still-vesting and on-exit value are shown but not counted. All values are pre-tax. `GET /equity` is the read model.
- **Mortgages and loans**: identical structures (`*_parts`, `*_extra_payments`, `*_members`). The `mortgages` and `loans` routes and pages mirror each other, so change both together.
- **Accounts**: `type` is checking or savings. `balance` is computed as `openingBalance` plus the sum of transactions since `openingBalanceDate`.
- Portfolios: `portfolios(type: crypto|metals|stocks, currency: EUR|USD, broker)`. `broker` is stocks-only.

## RBAC
- Global, from the JWT `groups` claim: `AUTHENTIK_ADMIN_GROUP` is admin and `AUTHENTIK_IMPORT_GROUP` can import (admins can too). The code defaults are `argent-admin` / `argent-import`, but `.env.development` sets `finance-admin`. Always set both explicitly.
- Per-resource roles (accounts, portfolios, mortgages, loans) live in `*_members(…, groupName, role)` with role `viewer` or `editor`. The owner (or an admin) manages members and deletion.
- No user table. Users and groups live in Authentik. `user_profiles` only caches email, name and theme.
- Importing a new IBAN creates the account with no access, and an admin assigns groups later. Importing an existing IBAN requires editor access, otherwise 403.

## Frontend layout (`packages/frontend/src`)
Vue 3 (`<script setup lang="ts">` SFCs). Pages are thin: they pick a feature and pass configuration. Real UI lives in `features/<area>/` and shared pieces in `components/`.
- `api/`: the only place that talks HTTP. `client.ts` (`http.get/post/...`, `ApiError`, token getter set by the auth object), one module per domain (`accounts`, `transactions`, `admin`, …), **generic factories** `portfolioApis` (crypto/metals/stocks) and `debtApis` (mortgages/loans), `keys.ts` (every query key) and `queries.ts` (`use*` composables + `useInvalidate`). **Never write `useQuery({ queryKey: [...] })` or `invalidateQueries({ queryKey: [...] })` in a page/component** — add a composable/key in `api/` so a resource has one key and refreshes everywhere. Keys are hierarchical (everything transaction-related is under `["transactions"]`). Query composables return refs: use `.value` in script, destructure the top-level refs for templates; reactive params are `MaybeRefOrGetter`.
- `auth/`: `createOidcAuth(settings)` / `createFakeAuth()` build a reactive `Auth` object (`user`, `isLoading`, `error`, `isAuthenticated`, `ready`, `signinRedirect/Callback`, `signoutRedirect`) and point the API token getter at it; `authPlugin(auth)` provides it, `useAuth()` injects it. `config.ts` reads OIDC config from `window.__ENV__`.
- `router.ts`: `createAppRouter(history, auth)` with lazy routes; the `beforeEach` guard awaits `auth.ready` and starts the sign-in when there is no session (`/auth/callback` is `meta.public`). `/transactions` redirects to `/overview`. `App.vue` is the loading/error gate plus `Layout` around `<RouterView>`.
- `components/ui/`: primitives — `Button` (type="button" by default), `Input`/`Select` (`density`, `v-model`; `Input` keeps the raw string even for type=number), `Card` (the white bordered panel; `size="xl"`, `as="form"`; don't spell the classes out), `Field` (provide/inject associates label↔control, shows `error`), `FieldGroup`, `SegmentedControl`, `ConfirmButton` (inline confirm; never use `window.confirm/alert`), `RoleBadge`, `LoadingText/ErrorText/EmptyState`, `vFocus` (autofocus directive). `components/SharingPanel.vue`, `Pagination.vue`, `Icon.vue` (named inline SVGs), `Layout.vue` are shared widgets.
- `features/portfolios/PortfolioPage.vue`: with >1 portfolio and an `#overview` slot it adds an **Overview** tab (first and default) fed with every visible portfolio's detail; `overview.ts` holds the pure aggregation (per currency — EUR/USD are never summed — then per symbol, or per metal) and `AssetsOverview`/`MetalsOverview` render it. Clicking a symbol in any positions table opens `AssetChart` (price history + the portfolio's buys/sells as ▲/▼ markers) built on `components/charts/LineChart.vue` (plain SVG, hover/keyboard tooltip, table view).
- `features/equity/` (`EquityPage` → `PlanCard`: share price, vested / still vesting / on exit, `GrantsTable` with vesting progress, `GrantForm` (add + edit), `PriceHistory` step chart + `PriceForm`). Forms use `novalidate`.
- `features/property/` (`PropertyPage` → `PropertyCard`: worth/owed/equity/gain, linked liabilities, `ValuationHistory` step chart + table, forms). Forms there use `novalidate` so the shared zod schemas explain errors instead of the browser's number checks.
- `features/debts/` (`DebtPage` serves both Mortgages and Loans via `DEBT_KINDS`), `features/portfolios/` (`PortfolioPage` shell with a scoped slot `{ portfolio }` + `crypto/`, `stocks/`, `metals/` views), `features/transactions/`, `features/subscriptions/`, `features/dashboard/` (`summarize.ts` is the pure net-worth logic), `features/admin/`, `features/settings/`, `features/import/`, `features/accounts/`.
- Forms validate with the **same zod schemas the backend uses**: build the request body, `check(schema, body)` from `useFormErrors()` (`lib/validate.ts`; `errors` is a ref), show `errors.<field>` via `<Field :error="…">`, and only then `mutate()`.
- `lib/format.ts`: all number/currency/date/P&L formatting. Don't define `fmt*` helpers inside components.
- Tailwind `content` includes `.vue`. `vue-tsc` is the type checker (`noUnusedLocals` on); test files are checked separately (`tsconfig.test.json`).

## Frontend testing (`bun run test` in `packages/frontend` = Vitest)
- Vitest + happy-dom + Testing Library for Vue (`test/setup.ts`). Use `bunx vitest run`, not `bun test` (that is Bun's own runner).
- `await renderApp(Component, { props, slots, route, routes, auth, client, router })` from `test/render.ts` wraps vue-query, a memory router (with a catch-all blank route; pass `routes` to assert navigation via `router.currentRoute.value`), and fake auth. It is async because the router must finish its first navigation. `renderTemplate` renders a template string; `runComposable` runs a composable in an app context. Pass component events as `onFoo` props.
- The API is faked at the `fetch` level: `mockApi({ "GET /x": data, "POST /x/:id": ({ body, params }) => … })` (`test/fakeApi.ts`); assert with `api.calls("POST", "/x")` and `api.unmatched` (requests nobody mocked). Because tests go through the real network layer, they survive refactors of `src/api/`.
- `test/fixtures.ts` has fixtures typed against `@argent/shared`; find controls with `screen.getByLabelText`.
- The token getter in `api/client.ts` is module-level state (set when an auth object is created): tests that set it must reset it.
- Run in random order (`bunx vitest run --sequence.shuffle`) when touching shared test state.

## Env vars
- Backend: `DATABASE_URL`, `AUTHENTIK_ISSUER`, `CORS_ORIGIN`, `AUTHENTIK_ADMIN_GROUP`, `AUTHENTIK_IMPORT_GROUP`, optional `COINGECKO_API_KEY`.
- Frontend: `VITE_AUTHENTIK_AUTHORITY`, `VITE_AUTHENTIK_CLIENT_ID`, `VITE_AUTH_MODE=fake` (dev only).

## Open deployment TODOs
- Replace the `your-registry/finance-*` image refs and `finance.example.com` in `k8s/`.
- Create the Authentik OIDC app with a public client and redirect URI `https://<domain>/auth/callback`.
- The CloudNativePG operator, cert-manager and a `letsencrypt` ClusterIssuer must exist before applying `k8s/postgres.yaml` and `k8s/ingress.yaml`.
