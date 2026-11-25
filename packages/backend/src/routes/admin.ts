import { Hono } from "hono"
import { and, eq } from "drizzle-orm"
import { db } from "../db"
import { accounts, accountMembers } from "../db/schema"
import type { AuthUser } from "../middleware/auth"
import { requireAdmin } from "../middleware/guards"
import { validateJson } from "../middleware/validate"
import { clearAllData, createBackup, restoreBackup, restoreSchema } from "../services/backup"
import { SHARING_OVERVIEW } from "../services/sharedResources"
import { groupBy } from "../lib/groupBy"
import { setAccountOwnerSchema, addMemberSchema, clearAllDataSchema } from "@argent/shared"

const app = new Hono<{ Variables: { user: AuthUser } }>()

// everything here is admin-only
app.use("*", requireAdmin)

// GET /api/admin/accounts — all accounts with their member list and resolved owner profile
app.get("/accounts", async (c) => {
  const allAccounts = await db.select().from(accounts).orderBy(accounts.iban)

  const result = await Promise.all(
    allAccounts.map(async (acc) => {
      const [members, ownerProfile] = await Promise.all([
        db
          .select({ groupName: accountMembers.groupName, role: accountMembers.role })
          .from(accountMembers)
          .where(eq(accountMembers.accountId, acc.id)),
        acc.ownerSub
          ? db.query.userProfiles.findFirst({
              where: (p, { eq }) => eq(p.sub, acc.ownerSub!),
              columns: { email: true, name: true },
            })
          : Promise.resolve(null),
      ])

      return { ...acc, members, ownerProfile: ownerProfile ?? null }
    }),
  )

  return c.json(result)
})

// PATCH /api/admin/accounts/:id — update ownerSub (ownership transfer)
app.patch("/accounts/:id", validateJson(setAccountOwnerSchema), async (c) => {
  const { ownerSub } = c.req.valid("json")

  const [updated] = await db
    .update(accounts)
    .set({ ownerSub: ownerSub ?? null })
    .where(eq(accounts.id, c.req.param("id")))
    .returning()

  if (!updated) return c.json({ error: "Not found" }, 404)
  return c.json(updated)
})

// POST /api/admin/accounts/:id/members — grant a group access to an account
app.post("/accounts/:id/members", validateJson(addMemberSchema), async (c) => {
  const accountId = c.req.param("id")
  const { groupName, role } = c.req.valid("json")
  const memberRole = role ?? "viewer"

  const [account] = await db.select({ id: accounts.id }).from(accounts).where(eq(accounts.id, accountId))
  if (!account) return c.json({ error: "Account not found" }, 404)

  await db
    .insert(accountMembers)
    .values({ accountId, groupName, role: memberRole })
    .onConflictDoUpdate({ target: [accountMembers.accountId, accountMembers.groupName], set: { role: memberRole } })

  return c.json({ accountId, groupName, role: memberRole }, 201)
})

// DELETE /api/admin/accounts/:id/members/:groupName — revoke a group's access
app.delete("/accounts/:id/members/:groupName", async (c) => {
  const accountId = c.req.param("id")
  const groupName = c.req.param("groupName")

  await db
    .delete(accountMembers)
    .where(and(eq(accountMembers.accountId, accountId), eq(accountMembers.groupName, groupName)))

  return c.body(null, 204)
})

// GET /api/admin/sharing — consolidated read-only view of everything that is shared with groups
// (portfolios, mortgages, loans, properties, stock options). Driven by SHARING_OVERVIEW: a new shareable
// resource type shows up here by being added to that list.
app.get("/sharing", async (c) => {
  const entries = await Promise.all(
    SHARING_OVERVIEW.map(async ({ key, resource, name, type }) => {
      const [rows, members] = await Promise.all([
        db.select({ id: resource.id, name: name, ...(type ? { type } : {}) }).from(resource.table),
        db.select({ resourceId: resource.memberResourceId, groupName: resource.memberGroup, role: resource.memberRole }).from(resource.members),
      ])
      const membersOf = groupBy(members, (m) => m.resourceId as string)
      const shared = rows
        .filter((r) => membersOf.has(r.id as string))
        .map((r) => ({ ...r, members: membersOf.get(r.id as string)!.map(({ groupName, role }) => ({ groupName, role })) }))
      return [key, shared] as const
    }),
  )
  return c.json(Object.fromEntries(entries))
})

// GET /api/admin/backup — export all data as a JSON file
app.get("/backup", async (c) => {
  const filename = `argent-backup-${new Date().toISOString().slice(0, 10)}.json`
  return new Response(JSON.stringify(await createBackup(), null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  })
})

// POST /api/admin/restore — wipe all data and restore from a backup JSON (one transaction: a bad row rolls everything back)
app.post("/restore", validateJson(restoreSchema), async (c) => {
  const restored = await restoreBackup(c.req.valid("json") as Parameters<typeof restoreBackup>[0])
  return c.json({ ok: true, restored })
})

// POST /api/admin/clear — erase ALL data (every table, in one transaction); the body must say { confirm: "erase all data" }
app.post("/clear", validateJson(clearAllDataSchema), async (c) => {
  await clearAllData()
  return c.json({ ok: true })
})

export default app
