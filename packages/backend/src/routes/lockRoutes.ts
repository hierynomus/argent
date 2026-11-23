import { Hono } from "hono"
import { deleteCookie, getCookie, setCookie } from "hono/cookie"
import { removePasswordSchema, setPasswordSchema, unlockSchema } from "@argent/shared"
import { validateJson } from "../middleware/validate"
import type { LocalLock } from "../services/localLock"

export const SESSION_COOKIE = "argent_session"

/**
 * The password of the standalone app (`/api/local/auth/*`). These routes sit in front of the lock itself: status,
 * unlock and lock are open; setting, changing or removing the password needs an unlocked session.
 */
export function lockRoutes(lock: LocalLock) {
  const app = new Hono()
  const tokenOf = (c: Parameters<typeof getCookie>[0]) => getCookie(c, SESSION_COOKIE)
  // loopback only and no https: a session cookie that other sites' requests never carry
  const startSession = (c: Parameters<typeof setCookie>[0], token: string) =>
    setCookie(c, SESSION_COOKIE, token, { httpOnly: true, sameSite: "Strict", path: "/" })
  const tooMany = (c: any, seconds: number) => {
    c.header("Retry-After", String(seconds))
    return c.json({ error: `Too many wrong passwords. Try again in ${seconds} seconds.` }, 429)
  }

  app.get("/status", (c) => c.json({ passwordSet: lock.isSet(), unlocked: lock.isUnlocked(tokenOf(c)) }))

  app.post("/unlock", validateJson(unlockSchema), async (c) => {
    const result = await lock.unlock(c.req.valid("json").password)
    if (!result) return c.json({ error: "Wrong password" }, 401)
    if ("wait" in result) return tooMany(c, result.wait)
    startSession(c, result.token)
    return c.json({ passwordSet: lock.isSet(), unlocked: true })
  })

  app.post("/lock", (c) => {
    lock.lock(tokenOf(c))
    deleteCookie(c, SESSION_COOKIE, { path: "/" })
    return c.json({ passwordSet: lock.isSet(), unlocked: !lock.isSet() })
  })

  app.put("/password", validateJson(setPasswordSchema), async (c) => {
    if (!lock.isUnlocked(tokenOf(c))) return c.json({ error: "Locked", locked: true }, 401)
    const { password, currentPassword } = c.req.valid("json")
    const result = await lock.setPassword(password, currentPassword)
    if (result === "wrong-password") return c.json({ error: "The current password is wrong" }, 403)
    if ("wait" in result) return tooMany(c, result.wait)
    startSession(c, result.token)
    return c.json({ passwordSet: true, unlocked: true })
  })

  app.post("/password/remove", validateJson(removePasswordSchema), async (c) => {
    if (!lock.isUnlocked(tokenOf(c))) return c.json({ error: "Locked", locked: true }, 401)
    const result = await lock.removePassword(c.req.valid("json").currentPassword)
    if (result === "wrong-password") return c.json({ error: "The current password is wrong" }, 403)
    if (typeof result === "object") return tooMany(c, result.wait)
    deleteCookie(c, SESSION_COOKIE, { path: "/" })
    return c.json({ passwordSet: false, unlocked: true })
  })

  return app
}
