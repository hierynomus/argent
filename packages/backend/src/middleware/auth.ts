import { createMiddleware } from "hono/factory"
import { createRemoteJWKSet, jwtVerify } from "jose"
import { db } from "../db"
import { userProfiles } from "../db/schema"

export interface AuthUser {
  sub: string
  email?: string
  name?: string
  groups?: string[]
  isAdmin: boolean
  canImport: boolean
}

const ADMIN_GROUP = process.env.AUTHENTIK_ADMIN_GROUP ?? "argent-admin"
const IMPORT_GROUP = process.env.AUTHENTIK_IMPORT_GROUP ?? "argent-import"

// In-process session tracker: sub → last-synced iat (JWT issued-at)
// Avoids a DB write on every request — only syncs once per login session.
const profileSynced = new Map<string, number>()

function syncProfileOnce(sub: string, email: string | null, name: string | null, iat: number) {
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
    .catch(() => {})
}

// ── Fake auth (local dev) ────────────────────────────────────────────────────
// Set AUTH_MODE=fake to bypass JWT validation entirely. The middleware will
// inject a static dev user so every request is treated as authenticated.
if (process.env.AUTH_MODE === "fake") {
  console.warn("[auth] AUTH_MODE=fake — JWT validation disabled. Do not use in production.")
}

const fakeAuthMiddleware = createMiddleware<{
  Variables: { user: AuthUser }
}>(async (c, next) => {
  const user: AuthUser = {
    sub: "dev-user",
    email: "dev@localhost",
    name: "Dev User",
    groups: [ADMIN_GROUP, IMPORT_GROUP],
    isAdmin: true,
    canImport: true,
  }
  c.set("user", user)
  // iat = 0 → syncs once per server start
  syncProfileOnce(user.sub, user.email ?? null, user.name ?? null, 0)
  await next()
})

// ── Real auth (JWKS) ─────────────────────────────────────────────────────────
function createRealAuthMiddleware() {
  const AUTHENTIK_ISSUER = process.env.AUTHENTIK_ISSUER
  if (!AUTHENTIK_ISSUER) {
    throw new Error("AUTHENTIK_ISSUER environment variable is required")
  }

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
  process.env.AUTH_MODE === "fake" ? fakeAuthMiddleware : createRealAuthMiddleware()
