import { getCookie } from "hono/cookie"
import { lockRoutes, SESSION_COOKIE } from "./routes/lockRoutes"
import type { LocalLock } from "./services/localLock"
import { Hono } from "hono"
import { config } from "./config"
import { cors } from "hono/cors"
import { logger } from "hono/logger"
import { HTTPException } from "hono/http-exception"
import type { MiddlewareHandler } from "hono"
import { authMiddleware } from "./middleware/auth"
import accountsRoute from "./routes/accounts"
import categoriesRoute from "./routes/categories"
import transactionsRoute from "./routes/transactions"
import importRoute from "./routes/import"
import subscriptionsRoute from "./routes/subscriptions"
import meRoute from "./routes/me"
import adminRoute from "./routes/admin"
import cryptoRoute from "./routes/crypto"
import metalsRoute from "./routes/metals"
import stocksRoute from "./routes/stocks"
import mortgagesRoute from "./routes/mortgages"
import loansRoute from "./routes/loans"
import propertiesRoute from "./routes/properties"
import equityRoute from "./routes/equity"
import pensionsRoute from "./routes/pensions"
import netWorthRoute from "./routes/netWorth"
import { localRoutes } from "./routes/localRoutes"
import type { LocalSettingsStore } from "./services/localSettings"

/**
 * Builds the HTTP app (routes + middleware) without starting a server or any
 * background jobs, so tests can drive it with `app.request(...)`.
 */
export function createApp({
  logRequests = false,
  auth = authMiddleware,
  spa,
  local,
  lock,
}: {
  logRequests?: boolean
  /** Replaces the authentication middleware — for tests that need to act as a specific user. */
  auth?: MiddlewareHandler
  /** Serves the web app (standalone install): answers a non-API path, or null to fall through to the 404. */
  spa?: (path: string) => Promise<Response | null>
  /** The standalone app's own settings and folder backups (`/api/local/*`). */
  local?: LocalSettingsStore
  /** The standalone app's password: every API route except its own is closed until it is unlocked. */
  lock?: LocalLock
} = {}) {
  const app = new Hono()

  if (logRequests) app.use(logger())
  app.use(
    cors({
      origin: config.corsOrigin,
      credentials: true,
    })
  )

  app.get("/health", (c) => c.json({ status: "ok" }))

  if (spa) {
    app.use("*", async (c, next) => {
      if (c.req.path === "/api" || c.req.path.startsWith("/api/") || (c.req.method !== "GET" && c.req.method !== "HEAD")) return next()
      return (await spa(c.req.path)) ?? next()
    })
  }

  // All API routes require authentication
  const api = app.basePath("/api")
  if (lock) {
    api.route("/local/auth", lockRoutes(lock))
    api.use(async (c, next) => {
      if (lock.isUnlocked(getCookie(c, SESSION_COOKIE))) return next()
      return c.json({ error: "Locked", locked: true }, 401)
    })
  }
  api.use(auth)

  api.route("/me", meRoute)
  api.route("/accounts", accountsRoute)
  api.route("/categories", categoriesRoute)
  api.route("/transactions", transactionsRoute)
  api.route("/import", importRoute)
  api.route("/subscriptions", subscriptionsRoute)
  api.route("/admin", adminRoute)
  api.route("/crypto", cryptoRoute)
  api.route("/metals", metalsRoute)
  api.route("/stocks", stocksRoute)
  api.route("/mortgages", mortgagesRoute)
  api.route("/loans", loansRoute)
  api.route("/properties", propertiesRoute)
  api.route("/equity", equityRoute)
  api.route("/pensions", pensionsRoute)
  api.route("/net-worth", netWorthRoute)
  if (local) api.route("/local", localRoutes(local))

  // Consistent JSON errors: the frontend reads `{ error }` from every failure.
  app.notFound((c) => c.json({ error: "Not found" }, 404))
  app.onError((err, c) => {
    if (err instanceof HTTPException) {
      return c.json({ error: err.message || "Request failed" }, err.status)
    }
    console.error(`[error] ${c.req.method} ${c.req.path}:`, err)
    return c.json({ error: "Internal server error" }, 500)
  })

  return app
}
