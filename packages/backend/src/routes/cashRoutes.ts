import type { Hono } from "hono"
import { and, eq } from "drizzle-orm"
import { db } from "../db"
import { portfolioCashMovements } from "../db/schema"
import { canEditPortfolio, toAccessContext } from "../services/accessControl"
import type { AuthUser } from "../middleware/auth"
import { validateJson } from "../middleware/validate"
import { createCashMovementSchema } from "@argent/shared"

/** The cash account routes of a crypto/stocks portfolio: record a deposit, withdrawal, fee or interest, and remove one. */
export function mountCashRoutes(app: Hono<{ Variables: { user: AuthUser } }>, type: "crypto" | "stocks") {
  app.post("/:id/cash", validateJson(createCashMovementSchema), async (c) => {
    const portfolioId = c.req.param("id")
    if (!(await canEditPortfolio(toAccessContext(c.get("user")), type, portfolioId))) return c.json({ error: "Forbidden" }, 403)
    const body = c.req.valid("json")
    const [movement] = await db
      .insert(portfolioCashMovements)
      .values({ portfolioId, movementDate: body.movementDate, type: body.type, amount: body.amount, notes: body.notes || null })
      .returning()
    return c.json(movement, 201)
  })

  // unlike trades, cash movements are bookkeeping and can be removed
  app.delete("/:id/cash/:movementId", async (c) => {
    const { id: portfolioId, movementId } = c.req.param()
    if (!(await canEditPortfolio(toAccessContext(c.get("user")), type, portfolioId))) return c.json({ error: "Forbidden" }, 403)
    const deleted = await db
      .delete(portfolioCashMovements)
      .where(and(eq(portfolioCashMovements.id, movementId), eq(portfolioCashMovements.portfolioId, portfolioId)))
      .returning()
    if (deleted.length === 0) return c.json({ error: "Not found" }, 404)
    return c.body(null, 204)
  })
}
