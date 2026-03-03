import { Hono } from "hono"
import { cors } from "hono/cors"
import { logger } from "hono/logger"
import { authMiddleware } from "./middleware/auth"
import { linkTransfers } from "./services/transferLinker"
import { detectSubscriptions } from "./services/subscriptionDetector"
import accountsRoute from "./routes/accounts"
import categoriesRoute from "./routes/categories"
import transactionsRoute from "./routes/transactions"
import importRoute from "./routes/import"
import subscriptionsRoute from "./routes/subscriptions"
import meRoute from "./routes/me"
import adminRoute from "./routes/admin"
import cryptoRoute from "./routes/crypto"
import metalsRoute from "./routes/metals"
import mortgagesRoute from "./routes/mortgages"
import loansRoute from "./routes/loans"

const app = new Hono()

app.use(logger())
app.use(
  cors({
    origin: process.env.CORS_ORIGIN ?? "http://localhost:5173",
    credentials: true,
  })
)

app.get("/health", (c) => c.json({ status: "ok" }))

// All API routes require authentication
const api = app.basePath("/api")
api.use(authMiddleware)

api.route("/me", meRoute)
api.route("/accounts", accountsRoute)
api.route("/categories", categoriesRoute)
api.route("/transactions", transactionsRoute)
api.route("/import", importRoute)
api.route("/subscriptions", subscriptionsRoute)
api.route("/admin", adminRoute)
api.route("/crypto", cryptoRoute)
api.route("/metals", metalsRoute)
api.route("/mortgages", mortgagesRoute)
api.route("/loans", loansRoute)

const port = Number(process.env.PORT ?? 3000)
console.log(`Backend listening on port ${port}`)

// Run once on startup to catch any pre-existing unlinked transfers/subscriptions
linkTransfers().then((n) => n > 0 && console.log(`[linker] Startup: linked ${n} transfer pair(s)`))
detectSubscriptions().then((n) => n > 0 && console.log(`[subscriptions] Detected ${n} new subscription(s)`))

// Periodic sweep — catches imports done outside normal flow (e.g. direct DB load)
const LINK_INTERVAL_MS = Number(process.env.TRANSFER_LINK_INTERVAL_MS ?? 5 * 60 * 1000)
setInterval(
  () => linkTransfers().then((n) => n > 0 && console.log(`[linker] Periodic: linked ${n} transfer pair(s)`)),
  LINK_INTERVAL_MS,
)
setInterval(
  () => detectSubscriptions().then((n) => n > 0 && console.log(`[subscriptions] Periodic: ${n} new`)),
  LINK_INTERVAL_MS,
)

export default {
  port,
  fetch: app.fetch,
}
