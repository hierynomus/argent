import { Hono } from "hono"
import { eq } from "drizzle-orm"
import { db } from "../db"
import { userProfiles } from "../db/schema"
import type { AuthUser } from "../middleware/auth"
import { validateJson } from "../middleware/validate"
import { updateMeSchema } from "@argent/shared"

const app = new Hono<{ Variables: { user: AuthUser } }>()

const VALID_THEMES = ["light", "dark", "system"] as const
type Theme = (typeof VALID_THEMES)[number]

function meResponse(user: AuthUser, theme: Theme) {
  return {
    sub: user.sub,
    email: user.email ?? null,
    name: user.name ?? null,
    isAdmin: user.isAdmin,
    canImport: user.canImport,
    theme,
  }
}

app.get("/", async (c) => {
  const user = c.get("user")
  const profile = await db.query.userProfiles.findFirst({
    where: (p, { eq }) => eq(p.sub, user.sub),
  })
  return c.json(meResponse(user, (profile?.theme as Theme) ?? "system"))
})

app.patch("/", validateJson(updateMeSchema), async (c) => {
  const user = c.get("user")
  const { theme } = c.req.valid("json")

  if (theme === undefined) return c.json({ error: "No fields to update" }, 400)

  await db
    .update(userProfiles)
    .set({ theme, updatedAt: new Date() })
    .where(eq(userProfiles.sub, user.sub))

  const profile = await db.query.userProfiles.findFirst({
    where: (p, { eq }) => eq(p.sub, user.sub),
  })
  return c.json(meResponse(user, (profile?.theme as Theme) ?? "system"))
})

export default app
