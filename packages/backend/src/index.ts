import { createApp } from "./app"
import { runBackgroundJobs } from "./services/backgroundJobs"

const app = createApp({ logRequests: true })

const port = Number(process.env.PORT ?? 3000)
console.log(`Backend listening on port ${port}`)

// Run once on startup to catch any pre-existing unlinked transfers/subscriptions
void runBackgroundJobs("startup")

// Periodic sweep — catches imports done outside normal flow (e.g. direct DB load)
const SWEEP_INTERVAL_MS = Number(process.env.TRANSFER_LINK_INTERVAL_MS ?? 5 * 60 * 1000)
setInterval(() => void runBackgroundJobs("periodic"), SWEEP_INTERVAL_MS)

export default {
  port,
  fetch: app.fetch,
}
