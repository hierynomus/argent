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

/**
 * Builds the HTTP app (routes + middleware) without starting a server or any
 * background jobs, so tests can drive it with `app.request(...)`.
 */
export function createApp({
  logRequests = false,
  auth = authMiddleware,
}: {
  logRequests?: boolean
  /** Replaces the authentication middleware — for tests that need to act as a specific user. */
  auth?: MiddlewareHandler
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

  // All API routes require authentication
  const api = app.basePath("/api")
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
