export interface Config {
  production: boolean
  authMode: "oidc" | "fake"
  /** OIDC issuer (required unless authMode is fake) */
  issuer: string | undefined
  adminGroup: string
  importGroup: string
  corsOrigin: string
  port: number
  sweepIntervalMs: number
  /** optional CoinGecko demo API key: a much higher rate limit than the key-less API */
  coingeckoApiKey: string | undefined
}

type Env = Record<string, string | undefined>

/**
 * Reads and validates the environment once. Throws with every problem listed, so a misconfigured
 * deployment fails at startup instead of running with insecure defaults.
 *
 * In production: fake auth is refused, and the admin/import group names must be set explicitly
 * (the code defaults differ from the dev environment's, which silently locks admins out).
 */
export function loadConfig(env: Env = process.env): Config {
  const production = env.NODE_ENV === "production"
  const authMode = env.AUTH_MODE === "fake" ? "fake" : "oidc"
  const problems: string[] = []

  if (production && authMode === "fake") problems.push("AUTH_MODE=fake is not allowed when NODE_ENV=production")
  // without it the app would silently fall back to the embedded development database
  if (production && (!env.DATABASE_URL || env.DATABASE_URL === "memory")) problems.push("DATABASE_URL (a Postgres connection string) is required in production")
  if (authMode === "oidc" && !env.AUTHENTIK_ISSUER) problems.push("AUTHENTIK_ISSUER is required")
  if (production && authMode === "oidc") {
    for (const name of ["AUTHENTIK_ADMIN_GROUP", "AUTHENTIK_IMPORT_GROUP", "CORS_ORIGIN"] as const) {
      if (!env[name]) problems.push(`${name} is required in production`)
    }
  }

  const port = Number(env.PORT ?? 3000)
  if (!Number.isInteger(port) || port <= 0) problems.push(`PORT must be a positive integer, got "${env.PORT}"`)
  const sweepIntervalMs = Number(env.TRANSFER_LINK_INTERVAL_MS ?? 5 * 60 * 1000)
  if (!Number.isFinite(sweepIntervalMs) || sweepIntervalMs <= 0) problems.push(`TRANSFER_LINK_INTERVAL_MS must be a positive number, got "${env.TRANSFER_LINK_INTERVAL_MS}"`)

  if (problems.length > 0) throw new Error(`Invalid configuration:\n- ${problems.join("\n- ")}`)

  return {
    production,
    authMode,
    issuer: env.AUTHENTIK_ISSUER,
    adminGroup: env.AUTHENTIK_ADMIN_GROUP ?? "argent-admin",
    importGroup: env.AUTHENTIK_IMPORT_GROUP ?? "argent-import",
    corsOrigin: env.CORS_ORIGIN ?? "http://localhost:5173",
    port,
    sweepIntervalMs,
    coingeckoApiKey: env.COINGECKO_API_KEY || undefined,
  }
}

/** The process-wide configuration (validated on first import). */
export const config = loadConfig()
