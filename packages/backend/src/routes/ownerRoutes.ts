import type { Hono } from "hono"
import { and, eq, getTableColumns } from "drizzle-orm"
import type { PgColumn, PgTable } from "drizzle-orm/pg-core"
import { db } from "../db"
import type { AuthUser } from "../middleware/auth"
import { isOwnerOrAdmin } from "../middleware/guards"
import { validateJson } from "../middleware/validate"
import { toAccessContext, type AccessContext } from "../services/accessControl"
import type { SharedResource } from "../services/sharedResources"
import { addMemberSchema } from "@argent/shared"

/** The JS property name of a column (what `values()` and result rows use), e.g. `mortgageId`. */
function keyOf(table: PgTable, column: PgColumn): string {
  const entry = Object.entries(getTableColumns(table)).find(([, c]) => c === column)
  if (!entry) throw new Error(`column ${column.name} is not part of ${table}`)
  return entry[0]
}

/**
 * The actions only the OWNER of a shared resource (or an admin) may take, identical for every kind of
 * resource: delete it, and manage which groups it is shared with. Mounted on a router as
 *
 *   DELETE /:id                      (cascades to the resource's own data)
 *   POST   /:id/members              { groupName, role? }  → add or change a group's role
 *   DELETE /:id/members/:groupName
 *
 * Someone who cannot even view the resource gets 404 (its existence is not revealed); a viewer or editor
 * who is not the owner gets 403.
 */
export function mountOwnerRoutes(
  app: Hono<{ Variables: { user: AuthUser } }>,
  { resource, canView }: { resource: SharedResource; canView: (ctx: AccessContext, id: string) => Promise<boolean> },
) {
  const ownerKey = keyOf(resource.table, resource.ownerSub)
  const memberIdKey = keyOf(resource.members, resource.memberResourceId)
  const groupKey = keyOf(resource.members, resource.memberGroup)

  /** An error response, or null when `user` may manage resource `id`. */
  async function refuse(user: AuthUser, id: string): Promise<{ status: 403 | 404; error: string } | null> {
    const [row] = await db.select().from(resource.table).where(eq(resource.id, id)).limit(1)
    if (!row || !(await canView(toAccessContext(user), id))) return { status: 404, error: "Not found" }
    if (!isOwnerOrAdmin({ ownerSub: (row as Record<string, string | null>)[ownerKey] }, user)) return { status: 403, error: "Forbidden" }
    return null
  }

  app.delete("/:id", async (c) => {
    const id = c.req.param("id")
    const refused = await refuse(c.get("user"), id)
    if (refused) return c.json({ error: refused.error }, refused.status)
    await db.delete(resource.table).where(eq(resource.id, id))
    return c.body(null, 204)
  })

  app.post("/:id/members", validateJson(addMemberSchema), async (c) => {
    const id = c.req.param("id")
    const refused = await refuse(c.get("user"), id)
    if (refused) return c.json({ error: refused.error }, refused.status)
    const body = c.req.valid("json")
    const groupName = body.groupName.trim()
    const role = body.role ?? "viewer"
    await db
      .insert(resource.members)
      .values({ [memberIdKey]: id, [groupKey]: groupName, role } as never)
      .onConflictDoUpdate({ target: [resource.memberResourceId, resource.memberGroup], set: { role } as never })
    return c.json({ groupName, role }, 201)
  })

  app.delete("/:id/members/:groupName", async (c) => {
    const { id, groupName } = c.req.param()
    const refused = await refuse(c.get("user"), id)
    if (refused) return c.json({ error: refused.error }, refused.status)
    await db.delete(resource.members).where(and(eq(resource.memberResourceId, id), eq(resource.memberGroup, groupName)))
    return c.body(null, 204)
  })
}
