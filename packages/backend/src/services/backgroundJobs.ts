import { linkTransfers } from "./transferLinker"
import { detectSubscriptions } from "./subscriptionDetector"

/**
 * Post-processing that follows new data (an import, startup, or a periodic sweep):
 *
 *   1. link internal transfers   — must run first, because the detector ignores linked transfers
 *   2. detect subscriptions
 *
 * Runs are queued one after another (never overlapping, never racing each other), and a failure
 * is logged instead of becoming an unhandled rejection.
 */
let tail: Promise<void> = Promise.resolve()

export function runBackgroundJobs(trigger: string): Promise<void> {
  const run = tail.then(async () => {
    try {
      const linked = await linkTransfers()
      if (linked > 0) console.log(`[linker] ${trigger}: linked ${linked} transfer pair(s)`)
      const created = await detectSubscriptions()
      if (created > 0) console.log(`[subscriptions] ${trigger}: detected ${created} new subscription(s)`)
    } catch (err) {
      console.error(`[jobs] ${trigger} failed:`, err)
    }
  })
  tail = run
  return run
}

/** Resolves when every queued run (including ones queued meanwhile) has finished. Mainly for tests. */
export async function settleBackgroundJobs(): Promise<void> {
  let current: Promise<void>
  do {
    current = tail
    await current
  } while (current !== tail)
}
