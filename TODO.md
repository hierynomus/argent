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
- [~] Shared-resource routes: `mountOwnerRoutes` (`routes/ownerRoutes.ts`) now provides owner delete + member add/remove for all 7 routers (404 for non-viewers, 403 for non-owners, portfolio kinds no longer mix). Still per-router: list-with-members, create, patch
- [x] `buildPositions`/`summarizePositions` (`services/positions.ts`) shared by the crypto + stocks routes
- [x] N+1 member/part/payment queries in the list endpoints: one `inArray` query per table, grouped in memory (`lib/groupBy.ts`)

## Validation and errors
- [x] Runtime validation with zod + `@hono/zod-validator` on every JSON route; schemas live in `@argent/shared` and the `*Body` types are derived from them
- [x] Global `app.onError` / `notFound` → consistent JSON errors; malformed JSON is a 400
- [x] `/admin/restore` validates its payload (it was already transactional; a bad row rolls back everything — tested)
- [x] Query parameters are validated with `validateQuery(schema)`: price history and the `/transactions` filters (`transactionFiltersSchema` in `@argent/shared`; also fixed: asking only for inaccessible accounts used to return everything, `%`/`_` in a search acted as wildcards)
- [x] Uploads are validated: body limit (10 MB XML / 25 MB ZIP), empty and wrong-type files, zip bombs (entry count and declared sizes checked before decompressing); limits in `IMPORT_LIMITS`
- [x] `/transactions` reads `c.req.valid("query")` (typed, parsed) instead of casting the raw query

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
- [x] Money precision: `services/money.ts` (decimal.js): exact FIFO, cent-rounded totals, exact oversell check, exact equity vesting rounding; epsilons centralized. Amortization still simulates in floats but rounds every step to cents with the decimal-exact `cents()`
- [x] Currency-specific names are gone: `totalCostEur`→`totalCost`, `currentValueEur`→`currentValue`, `totalOpenCostEur`→`totalOpenCost`, `totalCurrentValueEur`→`totalCurrentValue` (backend, shared types, frontend, tests; portfolios can be USD)
- [x] `linkPair` runs in a `db.transaction`, only touches still-unlinked rows and rolls back when the other leg was taken (both legs or neither)
- [x] Date arithmetic is time-zone independent (`lib/dates.ts`: ISO date strings, UTC calendar): `addDays` used to be a day early across daylight-saving changes in Europe/Amsterdam (wrong next-payment dates for subscriptions); amortization no longer depends on the server's zone. `bun run test:tz` runs the date tests under 5 zones
- [~] Price service: crypto tickers beyond the ~35 pinned ones are resolved via CoinGecko search (SHIB/PEPE and sub-cent prices work, FE shows enough decimals via `fmtPrice`). Rate limits are handled (backoff, Yahoo fallback, stale data, 503 + retry in the chart). Positions without a price show a "no price" badge; GBp/GBX/ZAc/ILA minor-unit quotes (London etc.) are converted correctly
- [x] Manual `POST /subscriptions` for a pair with a candidate now confirms the candidate (200) instead of failing with 409; only a confirmed one conflicts

## Performance
- [x] Indexes on `transactions` (account+date, category, subscription, transfer peer, counterparty IBAN, reference), FK/owner/group columns on the other tables (migration `0018_add_indexes`, generated by drizzle-kit)
- [ ] Transfer linker: avoid per-transaction queries (load candidates once, match in memory); share the ±3 day window helper
- [ ] Consider `pg_trgm` if description search becomes slow

## Deployment readiness
- [ ] CI has never run on GitHub (`.github/workflows/ci.yml`; frontend tests now run through Vitest)
- [ ] Install the Helm chart (`charts/argent`) on a real cluster with your registry/domain/Authentik values, and try the real login (the chart is lint/render/schema-checked and the images smoke-tested, but never installed)
- [x] Dev database persists (PGlite in `packages/backend/.data/pglite`, reused across `bun --hot` reloads); `bun run db:reset` to start over; tracked `.env.example` files; production requires `DATABASE_URL`. Still open: a seed script with sample data

## Background jobs / ops
- [~] Job runner: sequential, no overlap, errors logged (`services/backgroundJobs.ts`). Still open: named per-job scheduling/enable flags
- [ ] Advisory lock (`pg_try_advisory_lock`) before running jobs with multiple replicas
- [x] Central validated `config.ts` for env vars — `src/config.ts`, `loadConfig` with tests
- [x] Resolve group naming mismatch (`argent-admin` code default vs `finance-admin` dev env); fail on startup in production if unset — production now requires `AUTHENTIK_ADMIN_GROUP`/`AUTHENTIK_IMPORT_GROUP`/`CORS_ORIGIN` (added to `k8s/secrets.yaml`)
- [x] Refuse `AUTH_MODE=fake` when `NODE_ENV=production`
- [x] `syncProfileOnce` logs failures and retries on the session's next request (it used to swallow them and count the profile as synced)
- [x] Table registry: backup, restore, restore counts, request validation and the sharing overview derive from `BACKUP_ORDER` / `SHARING_OVERVIEW`; a drift test fails on an unregistered or mis-ordered table. Restore also inserts in chunks now (more than ~4000 transactions used to exceed Postgres' parameter limit)

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
- [x] `Card` primitive (`components/ui/Card.vue`, `size` lg|xl, `as`) replaces the white bordered panel in 29 places. Table primitives: `Th`/`Td`.
- [x] Balance locale: one `APP_LOCALE` (`nl-NL`) in `lib/format.ts` for every number and date. (was: Balance locale is inconsistent: Accounts tab / Settings pin `nl-NL`, Checking/Savings use the browser locale (kept as-is, now an explicit parameter). Decide one.)
- [x] Raw checkbox styling is the `Checkbox` primitive; header cells are `Th`, body cells `Td` (45 hand-written cells in 11 files converted; cells with other classes are still hand-written)
- [x] Accessibility: `src/a11y.test.ts` runs axe-core on every page and the main interactive states (contrast excluded: no layout in happy-dom); fixed unlabeled navs, empty table headers, unlabeled file input
- [ ] Try the app against a real Authentik (the OIDC flow was ported to `oidc-client-ts` directly and is only covered by fake-auth tests)

## Features (done, with what is deliberately not built)
- [x] Investment **overview tab** (all visible portfolios, per currency) and per-asset **price chart** with trade markers. Not built: metals history (no free source), historical FX for stock charts, portfolio-value-over-time
- [x] **Property** as an asset: manual dated valuations (flat until the next), linked mortgages/loans, equity, counted in net worth. Not built: equity-over-time chart (needs the debt's balance history), automatic valuation (WOZ), repayments-vs-appreciation split
- [x] **Stock options**: plans per company, time/exit grants, manual share prices, vested value in net worth. Not built: quarterly/yearly or accelerated vesting, tax estimate, exit-scenario calculator, expiry dates
- [x] **Loans/mortgages**: nominal or effective rate, day-aware payment dates, extra payments shorten the term, term entered in months
- [x] **Crypto**: any ticker via CoinGecko search, sub-cent prices, rate-limit resilience (backoff, Yahoo fallback, stale data)

## Review pass (2026-11-19) — found and fixed
- [x] `routes/mortgages.ts` and `routes/loans.ts` were identical but for names: now `routes/debtRoutes.ts` (`debtRoutes(config)`), so a change is made once
- [x] Remaining float money in routes (account balances, crypto swap cost basis, property debt/equity/gain, equity values, metals totals, mortgage/loan totals) uses `Decimal`/whole cents; `swapCostBasis` moves the exact share of the open cost
- [x] Two local `fmtPct` helpers moved to `lib/format.ts`; dashboard sums in whole cents
- [x] Mid-month payouts: `firstPaymentDate` on loan/mortgage parts (partial-month interest added to the loan)

## Review pass — open
- [ ] Amortization simulates in floats (rounded to cents at every step with the exact `cents()`); convert to `Decimal` if a long schedule ever drifts
- [ ] Partial-month interest uses days/days-in-month; banks differ (act/365, act/360, 30/360). A check against an external schedule is within about €2 after 8 years; make the convention a per-part option if it matters
- [ ] Editing a part cannot change start date, principal or first payment date (only name, rate, rate type, term): add them to the edit row (changing them rewrites history, so confirm)
- [ ] Metals compute per-lot values in floats and round only the totals; move to `Decimal` like crypto/stocks
- [ ] `PositionsTable` uses a literal `1e-10` as "open position" (the backend has `isOpenQuantity`): share one constant through `@argent/shared`
- [ ] The restore test prints a large `[error] POST /api/admin/restore` log (expected failure, but noisy): silence the logger in that test
- [ ] Frontend `overview.ts` aggregation sums floats per symbol; round to cents/decimals when aggregating money (display is rounded, so this is cosmetic)
- [ ] `Td` leaves cells with extra classes (e.g. colour from a function) hand-written; consider a `class` passthrough convention or a `negative`/`positive` tone

## Cash accounts of portfolios
- [x] Account number + cash balance for crypto/stocks portfolios (opening cash + deposits/withdrawals/fees/interest, derived from trades and dividends), shown on the page, in the overview tab and in net worth
- [ ] Suggest deposits/withdrawals from checking-account transactions whose counterparty IBAN is the portfolio's account number (one click to accept; avoid double entry)
- [ ] Warn when a buy exceeds the cash balance (shown negative today, never refused)
- [ ] Cash movements are not editable (delete and re-enter); add an edit row if that becomes annoying

## Fixed-rate periods (mortgages/loans)
- [x] Rate changes per part (end of a fixed-rate period): annuity repriced over the contract months left (or the remaining term, a per-part option), linear/interest-only follow the rate; future changes project the payment; shown in the part row and a Rates panel; also enterable when adding a part and in the preview
- [x] Continue the remainder as new parts at the reset date: close the part (`closedOn`), the new parts start that day (chain via `continuesPartId`), what is not continued is repaid; reopen possible
- [x] Reminder: a part whose rate period ends within three months is highlighted yellowish
- [ ] Closing does not record the repayment of the unconverted remainder as a payment (it is only shown as "repaid from savings" in the form); decide if it should appear in the extra-payments list
- [ ] Reopening a part leaves the parts that continued it in place (remove them by hand)
- [ ] Closing is the same day for the whole part; a mortgage where only a share of a part resets is modelled as two parts today

## Extra payments
- [x] Each extra payment either shortens the term (default, installment stays) or lowers the payment (end date stays); chosen when entering it, shown in the list
- [ ] Banks may offer the lowered installment only from a fixed day (next month's collection); here it applies to the next installment after the payment date
- [ ] An extra payment cannot be edited, only removed and re-entered (so changing its effect means re-entering it)

## Deployment (Helm chart and images)
- [x] `k8s/` replaced by `charts/argent` (hardened pods, Traefik/standard ingress, cert-manager, CloudNativePG or external DB, PDB/HPA/NetworkPolicy, schema, helm test); `bun run check:chart` + kubeconform in CI
- [x] Images on SUSE BCI micro (Bun / nginx), non-root, read-only root file system; `scripts/smoke-images.sh` runs them like Kubernetes does
- [x] The old backend Dockerfile never copied the lockfile (`bun.lockb*` did not match `bun.lock`) so `--frozen-lockfile` checked nothing; fixed
- [x] Migrations wait for the database and hold an advisory lock (replicas can start together)
- [ ] CI does not push images or publish the chart (OCI registry) yet; add a release workflow with `helm package`/`helm push` and image digests
- [ ] A kind-based install test in CI (`helm install` + `helm test` with the CNPG operator)
- [ ] The Trivy scan is informational; make it fail on fixable CRITICAL findings once the baseline is known
- [ ] nginx on BCI is 1.21.x (SUSE-patched); if a current upstream nginx matters, switch the frontend base to Chainguard or a Docker Hardened Image
- [ ] The CloudNativePG PostgreSQL image (`ghcr.io/cloudnative-pg/postgresql`) is Debian-based: choose a different image if a SUSE-based one becomes available for CNPG
- [ ] A Content-Security-Policy for the SPA (it must allow the Authentik authority in `connect-src`, which is runtime config)

## Hygiene
- [x] All migrations from now on come from `db:generate` (0018 does); `db:check` runs in `bun run check` and CI
- [x] `tsconfig.tsbuildinfo` is no longer tracked (the Vue build does not emit it)
- [ ] Root `package.json` was reformatted by tooling (workspaces array is expanded) — cosmetic


## Standalone / desktop app
- The Tauri shell (`packages/desktop`) was written but never compiled locally (no webkit2gtk dev libs here); the `desktop` CI job is its first build. Run it once and click through (window opens on the local server, closing it flushes the database).
- macOS/Windows installers and code signing / notarization; auto-update; release workflow publishing the installers.
- A settings screen in the app for `config.json` (port, data directory, external Postgres); today the file is edited by hand.
- Local mode has one user, so sharing/groups UI is meaningless there: hide it when `VITE_AUTH_MODE=local`.
- Verify the Browse… button in the real desktop window (the capability for the remote 127.0.0.1 origin is untested; the UI shows the error if the call is refused).
- The macOS/Windows jobs in `.github/workflows/desktop.yml` and `release.yml` have never run (no actionlint run either); expect to fix the first run. Windows: the standalone build/embedding and lock/signal code are untested there. Check the `macos-15-intel` runner label still exists. The release workflow (version bump from the latest tag, tag created by `gh release create`) has never run either.
