import { createMiddleware } from "hono/factory"
import { createRemoteJWKSet, jwtVerify } from "jose"
import { db } from "../db"
import { userProfiles } from "../db/schema"
import { config } from "../config"

export interface AuthUser {
  sub: string
  email?: string
  name?: string
  groups?: string[]
  isAdmin: boolean
  canImport: boolean
}

const ADMIN_GROUP = config.adminGroup
const IMPORT_GROUP = config.importGroup

// In-process session tracker: sub → last-synced iat (JWT issued-at)
// Avoids a DB write on every request — only syncs once per login session.
const profileSynced = new Map<string, number>()

/**
 * Stores the user's email and name the first time a session is seen. A failure is logged and forgotten, so
 * the next request of the same session tries again (it used to be swallowed AND counted as done, which
 * left the profile unsaved for the whole session after one transient database error).
 */
export function syncProfileOnce(sub: string, email: string | null, name: string | null, iat: number) {
  if (profileSynced.get(sub) === iat) return
  profileSynced.set(sub, iat)
  db.insert(userProfiles)
    .values({ sub, email, name })
    .onConflictDoUpdate({
      target: userProfiles.sub,
      // Only update identity fields — never overwrite user's theme preference
      set: { email, name, updatedAt: new Date() },
    })
    .then(() => {})
    .catch((err) => {
      profileSynced.delete(sub)
      console.error(`[auth] could not sync the profile of ${sub}: ${(err as Error).message}`)
    })
}

/** For tests: pretend no session has been seen yet. */
export const forgetSyncedProfiles = () => profileSynced.clear()

// ── Fake auth (local dev) ────────────────────────────────────────────────────
// Set AUTH_MODE=fake to bypass JWT validation entirely. The middleware will
// inject a static dev user so every request is treated as authenticated.
if (config.authMode === "fake") {
  console.warn("[auth] AUTH_MODE=fake — JWT validation disabled. Do not use in production.")
}

// AUTH_MODE=local (the standalone app): the same idea for the one person using their own computer. The
// server only listens on 127.0.0.1 in this mode (see config.ts), so there is nobody else to keep out.
function staticUserMiddleware(user: AuthUser) {
  return createMiddleware<{ Variables: { user: AuthUser } }>(async (c, next) => {
    c.set("user", user)
    // iat = 0 → syncs once per server start
    syncProfileOnce(user.sub, user.email ?? null, user.name ?? null, 0)
    await next()
  })
}

const fakeAuthMiddleware = staticUserMiddleware({
  sub: "dev-user",
  email: "dev@localhost",
  name: "Dev User",
  groups: [ADMIN_GROUP, IMPORT_GROUP],
  isAdmin: true,
  canImport: true,
})

const localAuthMiddleware = staticUserMiddleware({
  sub: "local-user",
  name: "Me",
  groups: [ADMIN_GROUP, IMPORT_GROUP],
  isAdmin: true,
  canImport: true,
})

// ── Real auth (JWKS) ─────────────────────────────────────────────────────────
function createRealAuthMiddleware() {
  const AUTHENTIK_ISSUER = config.issuer! // loadConfig guarantees it for OIDC mode

  const JWKS = createRemoteJWKSet(new URL(`${AUTHENTIK_ISSUER}/jwks/`))

  return createMiddleware<{ Variables: { user: AuthUser } }>(async (c, next) => {
    const authorization = c.req.header("Authorization")
    if (!authorization?.startsWith("Bearer ")) {
      return c.json({ error: "Unauthorized" }, 401)
    }

    const token = authorization.slice(7)

    try {
      const { payload } = await jwtVerify(token, JWKS, {
        issuer: AUTHENTIK_ISSUER,
      })

      const groups = payload.groups as string[] | undefined
      const isAdmin = groups?.includes(ADMIN_GROUP) ?? false
      const user: AuthUser = {
        sub: payload.sub as string,
        email: payload.email as string | undefined,
        name: payload.name as string | undefined,
        groups,
        isAdmin,
        canImport: isAdmin || (groups?.includes(IMPORT_GROUP) ?? false),
      }

      c.set("user", user)
      syncProfileOnce(
        user.sub,
        user.email ?? null,
        user.name ?? null,
        (payload.iat as number) ?? 0,
      )
      await next()
    } catch {
      return c.json({ error: "Unauthorized" }, 401)
    }
  })
}

export const authMiddleware =
  config.authMode === "fake" ? fakeAuthMiddleware : config.authMode === "local" ? localAuthMiddleware : createRealAuthMiddleware()
