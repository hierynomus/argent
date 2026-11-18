import { createApp } from "./app"
import { config } from "./config"
import { runBackgroundJobs } from "./services/backgroundJobs"

const app = createApp({ logRequests: true })

const port = config.port
console.log(`Backend listening on port ${port}`)

// Run once on startup to catch any pre-existing unlinked transfers/subscriptions
void runBackgroundJobs("startup")

// Periodic sweep — catches imports done outside normal flow (e.g. direct DB load)
const SWEEP_INTERVAL_MS = config.sweepIntervalMs
setInterval(() => void runBackgroundJobs("periodic"), SWEEP_INTERVAL_MS)

export default {
  port,
  fetch: app.fetch,
}
