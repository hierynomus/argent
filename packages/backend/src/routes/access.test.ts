import { beforeAll, describe, expect, test } from "bun:test"
import { Hono } from "hono"
import { db } from "../db"
import { accounts, accountMembers, mortgages, mortgageMembers, portfolios, portfolioMembers } from "../db/schema"
import type { AuthUser } from "../middleware/auth"
import accountsRoute from "./accounts"
import mortgagesRoute from "./mortgages"
import cryptoRoute from "./crypto"
import stocksRoute from "./stocks"

/** Mounts a route behind a stub auth middleware that injects the given user. */
function appAs(user: AuthUser, path: string, route: Hono<any>) {
  const app = new Hono<{ Variables: { user: AuthUser } }>()
  app.use(async (c, next) => { c.set("user", user); await next() })
  app.route(path, route)
  return app
}

const u = (sub: string, groups: string[] = [], isAdmin = false): AuthUser => ({ sub, groups, isAdmin, canImport: isAdmin })
const json = (body: unknown) => ({ method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })

let accountId: string, mortgageId: string, cryptoId: string, stocksId: string

beforeAll(async () => {
  ;[{ id: accountId }] = await db.insert(accounts).values({ iban: "NL00ROUTE0000000001", currency: "EUR", ownerSub: "own" }).returning()
  await db.insert(accountMembers).values([
    { accountId, groupName: "ro", role: "viewer" },
    { accountId, groupName: "rw", role: "editor" },
  ])
  ;[{ id: mortgageId }] = await db.insert(mortgages).values({ name: "m", ownerSub: "own" }).returning()
  await db.insert(mortgageMembers).values([
    { mortgageId, groupName: "ro", role: "viewer" },
    { mortgageId, groupName: "rw", role: "editor" },
  ])
  ;[{ id: cryptoId }] = await db.insert(portfolios).values({ type: "crypto", name: "c", ownerSub: "own" }).returning()
  ;[{ id: stocksId }] = await db.insert(portfolios).values({ type: "stocks", name: "s", ownerSub: "own" }).returning()
  for (const portfolioId of [cryptoId, stocksId]) {
    await db.insert(portfolioMembers).values([
      { portfolioId, groupName: "ro", role: "viewer" },
      { portfolioId, groupName: "rw", role: "editor" },
    ])
  }
})

describe("accounts route", () => {
  test("GET /:id → 200 for viewer, 404 for stranger", async () => {
    expect((await appAs(u("x", ["ro"]), "/", accountsRoute).request(`/${accountId}`)).status).toBe(200)
    expect((await appAs(u("x", ["zz"]), "/", accountsRoute).request(`/${accountId}`)).status).toBe(404)
  })

  test("PATCH /:id → 403 for viewer, 200 for editor", async () => {
    expect((await appAs(u("x", ["ro"]), "/", accountsRoute).request(`/${accountId}`, json({ name: "n" }))).status).toBe(403)
    expect((await appAs(u("x", ["rw"]), "/", accountsRoute).request(`/${accountId}`, json({ name: "n" }))).status).toBe(200)
  })
})

describe("mortgages route", () => {
  const post = (body: unknown) => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })

  test("adding a part: viewer and stranger are denied, editor is allowed", async () => {
    const part = { name: "p", type: "linear", principal: "1000", annualInterestRate: "0.03", startDate: "2024-01-01", endDate: "2034-01-01" }
    const req = (user: AuthUser) => appAs(user, "/", mortgagesRoute).request(`/${mortgageId}/parts`, post(part))
    expect((await req(u("x", ["ro"]))).status).toBe(404)
    expect((await req(u("x", ["zz"]))).status).toBe(404)
    expect((await req(u("x", ["rw"]))).status).toBe(201)
  })

  test("list only returns accessible mortgages, with canEdit flags", async () => {
    const ro = await (await appAs(u("x", ["ro"]), "/", mortgagesRoute).request("/")).json() as any[]
    expect(ro.find((m) => m.id === mortgageId)?.canEdit).toBe(false)
    const rw = await (await appAs(u("x", ["rw"]), "/", mortgagesRoute).request("/")).json() as any[]
    expect(rw.find((m) => m.id === mortgageId)?.canEdit).toBe(true)
    expect(await (await appAs(u("x", ["zz"]), "/", mortgagesRoute).request("/")).json()).toEqual([])
  })
})

describe("portfolio routes", () => {
  test("crypto: GET /:id is 404 for strangers and for a stocks portfolio id", async () => {
    expect((await appAs(u("x", ["ro"]), "/", cryptoRoute).request(`/${cryptoId}`)).status).toBe(200)
    expect((await appAs(u("x", ["zz"]), "/", cryptoRoute).request(`/${cryptoId}`)).status).toBe(404)
    expect((await appAs(u("own"), "/", cryptoRoute).request(`/${stocksId}`)).status).toBe(404)
  })

  test("stocks: PATCH is 403 for viewer and 200 for editor", async () => {
    expect((await appAs(u("x", ["ro"]), "/", stocksRoute).request(`/${stocksId}`, json({ name: "n" }))).status).toBe(403)
    expect((await appAs(u("x", ["rw"]), "/", stocksRoute).request(`/${stocksId}`, json({ name: "n" }))).status).toBe(200)
  })

  test("stocks: members can only be managed by the owner or an admin", async () => {
    const body = { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ groupName: "new", role: "viewer" }) }
    expect((await appAs(u("x", ["rw"]), "/", stocksRoute).request(`/${stocksId}/members`, body)).status).toBe(403)
    expect((await appAs(u("own"), "/", stocksRoute).request(`/${stocksId}/members`, body)).status).toBe(201)
    expect((await appAs(u("adm", [], true), "/", stocksRoute).request(`/${stocksId}/members`, body)).status).toBe(201)
  })
})
