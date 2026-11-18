import { Hono } from "hono"
import { db } from "../db"
import { categories } from "../db/schema"
import { eq } from "drizzle-orm"
import type { CreateCategoryBody } from "@argent/shared"
import type { AuthUser } from "../middleware/auth"
import { validateJson } from "../middleware/validate"
import { createCategorySchema, updateCategorySchema } from "@argent/shared"

const app = new Hono<{ Variables: { user: AuthUser } }>()

app.get("/", async (c) => {
  const rows = await db.query.categories.findMany({
    orderBy: (cat, { asc }) => [asc(cat.name)],
    with: { children: true },
  })
  return c.json(rows)
})

app.post("/", validateJson(createCategorySchema), async (c) => {
  const body = c.req.valid("json")

  const [category] = await db
    .insert(categories)
    .values({
      name: body.name.trim(),
      color: body.color ?? null,
      parentId: body.parentId ?? null,
    })
    .returning()

  return c.json(category, 201)
})

app.put("/:id", validateJson(updateCategorySchema), async (c) => {
  const body = c.req.valid("json")
  const id = c.req.param("id")

  const updates: Partial<typeof categories.$inferInsert> = {}
  if (body.name !== undefined) updates.name = body.name.trim()
  if (body.color !== undefined) updates.color = body.color
  if (body.parentId !== undefined) updates.parentId = body.parentId

  const [updated] = await db
    .update(categories)
    .set(updates)
    .where(eq(categories.id, id))
    .returning()

  if (!updated) return c.json({ error: "Not found" }, 404)
  return c.json(updated)
})

app.delete("/:id", async (c) => {
  const id = c.req.param("id")
  const [deleted] = await db
    .delete(categories)
    .where(eq(categories.id, id))
    .returning()

  if (!deleted) return c.json({ error: "Not found" }, 404)
  return c.body(null, 204)
})

export default app
