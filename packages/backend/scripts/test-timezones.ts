/**
 * Runs the tests that deal with calendar dates under several time zones. Dates here are calendar dates
 * (see src/lib/dates.ts), so the results must not depend on where the server runs — this is what proves it.
 *
 *   bun run test:tz
 *
 * Zones: UTC, Europe/Amsterdam (daylight saving in March/October), America/Los_Angeles (behind UTC),
 * Pacific/Auckland (far ahead) and Pacific/Kiritimati (UTC+14, the furthest).
 */
const ZONES = ["UTC", "Europe/Amsterdam", "America/Los_Angeles", "Pacific/Auckland", "Pacific/Kiritimati"]
const FILES = [
  "src/lib",
  "src/services/amortization.test.ts",
  "src/services/subscriptionDetector.test.ts",
  "src/services/subscriptionDetector.integration.test.ts",
  "src/services/equity.test.ts",
  "src/services/property.test.ts",
  "src/routes/debts.test.ts",
  "src/routes/properties.test.ts",
  "src/routes/equity.test.ts",
]

let failed = false
for (const tz of ZONES) {
  const proc = Bun.spawn(["bun", "test", ...FILES], { env: { ...process.env, TZ: tz }, stdout: "pipe", stderr: "pipe" })
  const [out, err] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()])
  const code = await proc.exited
  const summary = (out + err).split("\n").filter((l) => /^\s*\d+ (pass|fail)/.test(l)).map((l) => l.trim()).join(", ")
  console.log(`${code === 0 ? "✓" : "✗"} TZ=${tz.padEnd(20)} ${summary}`)
  if (code !== 0) {
    failed = true
    console.log((out + err).split("\n").filter((l) => /\(fail\)|error:/.test(l)).join("\n"))
  }
}
if (failed) {
  console.error("\nSome tests depend on the time zone.")
  process.exit(1)
}
