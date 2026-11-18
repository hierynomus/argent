import { createMiddleware } from "hono/factory"
import type { AuthUser } from "./auth"

/** Rejects everyone but admins with 403. Use as `app.use("*", requireAdmin)` on admin-only routers. */
export const requireAdmin = createMiddleware<{ Variables: { user: AuthUser } }>(async (c, next) => {
  if (!c.get("user").isAdmin) return c.json({ error: "Forbidden" }, 403)
  await next()
})

/** Owners of a resource (and admins) may manage it: share it with groups, delete it. */
export const isOwnerOrAdmin = (resource: { ownerSub: string | null }, user: Pick<AuthUser, "sub" | "isAdmin">) =>
  user.isAdmin || resource.ownerSub === user.sub
