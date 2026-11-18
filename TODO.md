# TODO — code analysis findings

Legend: `[ ]` open, `[~]` partly done, `[x]` done. Ordered by suggested priority.
Verify everything with `bun run check` (type-check all packages + all tests + "migrations match schema.ts").

## Safety net
- [x] Tests for the pure calculation code: `fifo`, `amortization`, `camt053`, `subscriptionDetector` helpers (`*.test.ts` next to the sources)
- [x] Access-control matrix (owner / viewer / editor / admin / stranger) for accounts, portfolios, mortgages, loans (`accessControl.test.ts`) and through the real routes (`routes/permissions.test.ts`, `routes/access.test.ts`)
- [x] HTTP-level tests of the real app on PGlite: banking/import/transactions/subscriptions, crypto/metals/stocks, mortgages/loans, admin + backup/restore round trip
- [x] Service tests against the database: transfer linker, subscription detector, background job runner; price service with a fake `fetch` (tests never touch the network)
- [x] Schema (validation) unit tests in `@argent/shared`; formatting tests in the frontend
- [x] CI workflow (`.github/workflows/ci.yml`: `bun run check` + frontend build). *Not yet run on GitHub — verify after the first push.*
- [x] All three packages type-check cleanly (`bun run typecheck`); test files are type-checked too
- [x] Frontend component/page tests (444 on Vue; see Frontend)
- [ ] Tests for `camt053` edge cases with real bank exports (samples from several Dutch banks)

## Access control / backend coupling
- [x] One generic access resolver instead of 8 near-identical functions; `canView*`/`canEdit*` single-resource checks; `toAccessContext(user)`
- [x] Extract owner-only / `requireAdmin` middleware instead of inline checks — `middleware/guards.ts` (`requireAdmin` on the admin router, `isOwnerOrAdmin` in the 5 shared-resource routes)
- [ ] Route factory (or shared helpers) for shared resources: owner delete and member add/remove are now copy-pasted in 7 routers (crypto/metals/stocks/mortgages/loans/properties/equity)
- [ ] Extract `buildPositions(trades, assets, priceFn, currency)` shared by crypto + stocks routes
- [x] N+1 member/part/payment queries in the list endpoints: one `inArray` query per table, grouped in memory (`lib/groupBy.ts`)

## Validation and errors
- [x] Runtime validation with zod + `@hono/zod-validator` on every JSON route; schemas live in `@argent/shared` and the `*Body` types are derived from them
- [x] Global `app.onError` / `notFound` → consistent JSON errors; malformed JSON is a 400
- [x] `/admin/restore` validates its payload (it was already transactional; a bad row rolls back everything — tested)
- [~] Validate query parameters with the same mechanism: `validateQuery(schema)` exists and covers the price-history endpoints; `/transactions` filters, `page`, `pageSize` still open
- [ ] Validate multipart uploads (size limit, content type) on the import endpoints
- [ ] Pass the parsed `TransactionFilters` type through a schema instead of casting `c.req.query()`

## Correctness
- [x] Transfer linker: a payment and its reversal on the SAME account were linked as an "internal transfer" (strategy 1 had no same-account guard) — fixed + tested
- [x] Import ran transfer-linking and subscription detection concurrently and un-awaited (detector could run first and flag internal transfers as subscriptions; unhandled rejections) — now one sequential, queued, error-logged job runner (`services/backgroundJobs.ts`)
- [x] Subscription candidates detected before the receiving account was imported stayed behind after their payments became transfers — detector now cleans up (candidates removed, confirmed ones kept)
- [x] Dashboard net worth added USD portfolios/accounts/debts to a EUR total although the UI says "Non-EUR portfolios are excluded" (only metals were). Now one pure, tested `summarize()` applies the rule to everything and flags exclusions.
- [x] After a backup restore nothing refreshed the cached data (the whole DB had changed); now everything is invalidated
- [x] Transaction-derived views (dashboard "recent", monthly summary) were not refreshed by transaction edits because their query keys were not under `["transactions"]`; one key factory fixes it
- [x] `SharingPanel` passed TanStack's mutation context as a stray second argument to its callbacks
- [x] Native `alert()`/`confirm()` replaced by inline messages/confirmation (Subscriptions, Overview bulk bar)
- [x] Saving a blank account name was sent as "unchanged" although the API can clear it
- [x] Icon-only "×" close button had no accessible name; form labels were not tied to their controls
- [x] `import_hash` ignored the account and the debit/credit direction, so identical entries on two accounts collided and the second was silently skipped. Hash now includes both (and a 2-decimal amount); migration 0019 recomputes stored hashes in SQL; tests cover it. Still true: identical entries on the same account collapse.
- [ ] Money as `float`: use a decimal lib (`decimal.js`/`big.js`) in `fifo.ts` and `amortization.ts`; centralize epsilon constants (`1e-10`, `1e-8`)
- [ ] Rename `totalCostEur` / `currentValueEur` to currency-neutral names (portfolios can be USD) across backend, shared types and frontend
- [ ] `linkPair` in `transferLinker.ts` should run in a `db.transaction`
- [ ] `addDays` / `daysBetween` / `amortization` use local time; switch to UTC
- [~] Price service: crypto tickers beyond the ~35 pinned ones are resolved via CoinGecko search (SHIB/PEPE and sub-cent prices work, FE shows enough decimals via `fmtPrice`). Rate limits are handled (backoff, Yahoo fallback, stale data, 503 + retry in the chart). Still open: surfacing "no price" in the positions table; GBp (pence) quotes for stocks
- [ ] Manual `POST /subscriptions` returns 409 when a *candidate* exists for the pair — consider confirming the candidate instead (UX)

## Performance
- [x] Indexes on `transactions` (account+date, category, subscription, transfer peer, counterparty IBAN, reference), FK/owner/group columns on the other tables (migration `0018_add_indexes`, generated by drizzle-kit)
- [ ] Transfer linker: avoid per-transaction queries (load candidates once, match in memory); share the ±3 day window helper
- [ ] Consider `pg_trgm` if description search becomes slow

## Deployment readiness
- [ ] CI has never run on GitHub (`.github/workflows/ci.yml`; frontend tests now run through Vitest)
- [ ] Set the `k8s/` placeholders (registry, domain, `AUTHENTIK_*` groups, optional `COINGECKO_API_KEY`) and try the real Authentik login
- [ ] Dev uses an in-memory PGlite that `bun --hot` recreates on every backend change: consider a persistent dev database or a seed script, since data entered during testing is lost

## Background jobs / ops
- [~] Job runner: sequential, no overlap, errors logged (`services/backgroundJobs.ts`). Still open: named per-job scheduling/enable flags
- [ ] Advisory lock (`pg_try_advisory_lock`) before running jobs with multiple replicas
- [x] Central validated `config.ts` for env vars — `src/config.ts`, `loadConfig` with tests
- [x] Resolve group naming mismatch (`argent-admin` code default vs `finance-admin` dev env); fail on startup in production if unset — production now requires `AUTHENTIK_ADMIN_GROUP`/`AUTHENTIK_IMPORT_GROUP`/`CORS_ORIGIN` (added to `k8s/secrets.yaml`)
- [x] Refuse `AUTH_MODE=fake` when `NODE_ENV=production`
- [ ] Log instead of swallowing errors in `syncProfileOnce`
- [ ] **Table registry driving backup/restore and the sharing overview.** Every new feature (property, equity) meant editing `admin.ts` in ~8 places by hand (imports, backup query, backup object, `BACKUP_TABLES`, restore type, delete order, insert order, summary, sharing). 36 tables now; one forgotten line silently drops data from backups

## Frontend
Vue 3 (rewritten from React; merged). `api/`, `lib/`, the shared zod schemas and the fetch-level test fakes are framework-agnostic and were carried over unchanged.
- [x] `lib/format.ts` (all number/currency/date/P&L formatting) with tests
- [x] API layer split by domain under `src/api/`; `api/keys.ts` + `api/queries.ts` own every query key, read composable and cache refresh (`useInvalidate`)
- [x] Mortgages and Loans are one `DebtPage`; Crypto/Metals/Stocks share `PortfolioPage` (scoped slot), `PortfolioActions`, `SummaryTiles`, `PositionsTable`, `TradeHistory`, form chrome
- [x] UI primitives in `components/ui` (`Field` associates label and control through provide/inject)
- [x] Client-side validation with the same `@argent/shared` schemas the backend enforces (`useFormErrors`)
- [x] Component/page tests (Vitest + happy-dom + Testing Library) against a fake API at the `fetch` level
- [x] Route-level code splitting
- [x] The 13 inline icon components are one `components/Icon.vue` keyed by name
- [-] Typed client from Hono's `AppType`: **decided against** — the shared zod schemas + `src/api/` already give end-to-end types
- [x] `Card` primitive (`components/ui/Card.vue`, `size` lg|xl, `as`) replaces the white bordered panel in 29 places. Table primitives still open.
- [x] Balance locale: one `APP_LOCALE` (`nl-NL`) in `lib/format.ts` for every number and date. (was: Balance locale is inconsistent: Accounts tab / Settings pin `nl-NL`, Checking/Savings use the browser locale (kept as-is, now an explicit parameter). Decide one.)
- [x] Raw checkbox styling is the `Checkbox` primitive; header cells are `Th` (body cells `Td` still hand-written)
- [x] Accessibility: `src/a11y.test.ts` runs axe-core on every page and the main interactive states (contrast excluded: no layout in happy-dom); fixed unlabeled navs, empty table headers, unlabeled file input
- [ ] Try the app against a real Authentik (the OIDC flow was ported to `oidc-client-ts` directly and is only covered by fake-auth tests)

## Features (done, with what is deliberately not built)
- [x] Investment **overview tab** (all visible portfolios, per currency) and per-asset **price chart** with trade markers. Not built: metals history (no free source), historical FX for stock charts, portfolio-value-over-time
- [x] **Property** as an asset: manual dated valuations (flat until the next), linked mortgages/loans, equity, counted in net worth. Not built: equity-over-time chart (needs the debt's balance history), automatic valuation (WOZ), repayments-vs-appreciation split
- [x] **Stock options**: plans per company, time/exit grants, manual share prices, vested value in net worth. Not built: quarterly/yearly or accelerated vesting, tax estimate, exit-scenario calculator, expiry dates
- [x] **Loans/mortgages**: nominal or effective rate, day-aware payment dates, extra payments shorten the term, term entered in months
- [x] **Crypto**: any ticker via CoinGecko search, sub-cent prices, rate-limit resilience (backoff, Yahoo fallback, stale data)

## Hygiene
- [x] All migrations from now on come from `db:generate` (0018 does); `db:check` runs in `bun run check` and CI
- [x] `tsconfig.tsbuildinfo` is no longer tracked (the Vue build does not emit it)
- [ ] Root `package.json` was reformatted by tooling (workspaces array is expanded) — cosmetic
