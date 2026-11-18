import { beforeAll, describe, expect, test } from "bun:test"
import { camt, clientAs, unique, uniqueIban, user } from "../../test/helpers"

// Actors. Groups are what the JWT would carry; roles are granted per resource through group membership.
const owner = clientAs(user("perm-owner", [], { canImport: true }))
const g = { view: unique("view"), edit: unique("edit"), other: unique("other") }
const viewer = clientAs(user("perm-viewer", [g.view]))
const editor = clientAs(user("perm-editor", [g.edit]))
const stranger = clientAs(user("perm-stranger", [g.other]))
const importer = clientAs(user("perm-importer", [g.other], { canImport: true })) // may import, but has no access to others' accounts
const editorImporter = clientAs(user("perm-editor-importer", [g.edit], { canImport: true }))
const admin = clientAs(user("perm-admin", [], { isAdmin: true }))
const admin2 = admin

let iban: string
let accountId: string

beforeAll(async () => {
  iban = uniqueIban()
  const today = new Date().toISOString().slice(0, 10)
  const xml = camt({ iban, entries: [
    { amount: "10.00", ind: "DBIT", date: today, ref: unique("a"), counterpartyIban: "NL00PERM0000000001" },
    { amount: "20.00", ind: "DBIT", date: today, ref: unique("b"), counterpartyIban: "NL00PERM0000000001" },
  ] })
  const r = await owner.upload("/import", "a.xml", xml)
  expect(r.status).toBe(201)
  accountId = (await owner.get("/accounts")).body.find((a: any) => a.iban === iban).id
  // the admin shares the account with two groups
  await admin.post(`/admin/accounts/${accountId}/members`, { groupName: g.view, role: "viewer" })
  await admin.post(`/admin/accounts/${accountId}/members`, { groupName: g.edit, role: "editor" })
})

describe("importing", () => {
  test("requires the global import permission", async () => {
    const r = await viewer.upload("/import", "a.xml", camt({ iban: uniqueIban() }))
    expect(r.status).toBe(403)
    expect(r.body.error).toContain("permission to import")
  })

  test("a user with import rights creates a NEW account and becomes its owner", async () => {
    const newIban = uniqueIban()
    expect((await importer.upload("/import", "a.xml", camt({ iban: newIban }))).status).toBe(201)
    const mine = (await importer.get("/accounts")).body.map((a: any) => a.iban)
    expect(mine).toContain(newIban)
    // nobody else sees it until an admin shares it
    expect((await stranger.get("/accounts")).body.map((a: any) => a.iban)).not.toContain(newIban)
    expect((await viewer.get("/accounts")).body.map((a: any) => a.iban)).not.toContain(newIban)
  })

  test("importing into an EXISTING account needs ownership or an editor group", async () => {
    const xml = camt({ iban, entries: [{ amount: "5.00", ind: "DBIT", date: "2024-09-01", ref: unique("n") }] })
    const denied = await importer.upload("/import", "a.xml", xml)
    expect(denied.status).toBe(403)
    expect(denied.body.error).toContain("Access denied")
    expect((await editorImporter.upload("/import", "a.xml", xml)).status).toBe(201) // editor group
    expect((await owner.upload("/import", "a.xml", camt({ iban, entries: [{ amount: "6.00", ind: "DBIT", date: "2024-09-02", ref: unique("n") }] }))).status).toBe(201) // owner
  })

  test("a viewer-only group is not enough, even with import rights", async () => {
    const viewerImporter = clientAs(user("perm-viewer-importer", [g.view], { canImport: true }))
    const r = await viewerImporter.upload("/import", "a.xml", camt({ iban }))
    expect(r.status).toBe(403)
  })

  test("ZIP import reports access problems per file instead of failing the batch", async () => {
    const { zipSync, strToU8 } = await import("fflate")
    const mine = uniqueIban()
    const zip = zipSync({ "ok.xml": strToU8(camt({ iban: mine })), "denied.xml": strToU8(camt({ iban })) })
    const form = new FormData(); form.set("file", new File([zip as BlobPart], "s.zip", { type: "application/zip" }))
    const { app } = await import("../../test/helpers")
    // act as the importer via a fresh client
    const r = await importer.upload("/import/zip", "s.zip", zip as unknown as string)
    expect(r.status).toBe(201)
    expect(r.body.results.map((x: any) => x.filename)).toEqual(["ok.xml"])
    expect(r.body.errors.map((x: any) => x.filename)).toEqual(["denied.xml"])
    expect(app).toBeDefined()
  })
})

describe("account visibility", () => {
  test("owner, viewer, editor and admin see it; a stranger does not", async () => {
    for (const who of [owner, viewer, editor, admin]) expect((await who.get("/accounts")).body.map((a: any) => a.iban)).toContain(iban)
    expect((await stranger.get("/accounts")).body.map((a: any) => a.iban)).not.toContain(iban)
    expect((await stranger.get(`/accounts/${accountId}`)).status).toBe(404)
  })

  test("only editors/owners can modify the account", async () => {
    expect((await viewer.patch(`/accounts/${accountId}`, { name: "x" })).status).toBe(403)
    expect((await stranger.patch(`/accounts/${accountId}`, { name: "x" })).status).toBe(403)
    expect((await editor.patch(`/accounts/${accountId}`, { name: "Edited" })).status).toBe(200)
    expect((await owner.patch(`/accounts/${accountId}`, { name: "Owned" })).status).toBe(200)
  })
})

describe("transactions", () => {
  let txId: string
  beforeAll(async () => { txId = (await owner.get(`/transactions?accountId=${accountId}`)).body.data[0].id })

  test("visible to viewer and editor, hidden from strangers", async () => {
    expect((await viewer.get(`/transactions?accountId=${accountId}`)).body.total).toBeGreaterThanOrEqual(2)
    expect((await editor.get(`/transactions?accountId=${accountId}`)).body.total).toBeGreaterThanOrEqual(2)
    expect((await stranger.get(`/transactions?accountId=${accountId}`)).body).toMatchObject({ data: [], total: 0 })
  })

  test("categorising needs edit rights (others see 'not found')", async () => {
    const cat = (await owner.post("/categories", { name: unique("c") })).body
    expect((await viewer.patch(`/transactions/${txId}`, { categoryId: cat.id })).status).toBe(404)
    expect((await stranger.patch(`/transactions/${txId}`, { categoryId: cat.id })).status).toBe(404)
    expect((await editor.patch(`/transactions/${txId}`, { categoryId: cat.id })).status).toBe(200)
  })

  test("transfer-suggestions are only available to people who can view the transaction", async () => {
    expect((await viewer.get(`/transactions/${txId}/transfer-suggestions`)).status).toBe(200)
    expect((await stranger.get(`/transactions/${txId}/transfer-suggestions`)).status).toBe(404)
  })

  test("linking a transfer requires edit rights on BOTH transactions", async () => {
    const otherIban = uniqueIban()
    await importer.upload("/import", "o.xml", camt({ iban: otherIban, entries: [{ amount: "10.00", ind: "CRDT", date: new Date().toISOString().slice(0, 10), ref: unique("o") }] }))
    const otherAccount = (await importer.get("/accounts")).body.find((a: any) => a.iban === otherIban).id
    const peer = (await importer.get(`/transactions?accountId=${otherAccount}`)).body.data[0]
    // `editor` can edit the first account but has no access to the second → forbidden
    const r = await editor.post(`/transactions/${txId}/transfer`, { peerId: peer.id })
    expect(r.status).toBe(403)
  })

  test("a transfer peer on an account you cannot see is hidden in listings", async () => {
    const hiddenIban = uniqueIban()
    const today = new Date().toISOString().slice(0, 10)
    const ref = unique("hp")
    // the importer's account is invisible to the viewer; both legs share an EndToEndId, so the linker pairs them
    expect((await importer.upload("/import", "h.xml", camt({ iban: hiddenIban, entries: [{ amount: "77.00", ind: "CRDT", date: today, ref, counterpartyIban: iban }] }))).status).toBe(201)
    expect((await owner.upload("/import", "v.xml", camt({ iban, entries: [{ amount: "77.00", ind: "DBIT", date: today, ref, counterpartyIban: hiddenIban }] }))).status).toBe(201)

    const find = async (who: typeof owner) => (await who.get(`/transactions?accountId=${accountId}&pageSize=200`)).body.data.find((t: any) => t.reference === ref)
    const seenByAdmin = await find(admin)
    expect(seenByAdmin.transferPeerId).not.toBeNull() // linked automatically

    const seenByViewer = await find(viewer)
    expect(seenByViewer).toBeDefined()
    expect(seenByViewer.transferPeerId).toBeNull() // ...but the other leg is not theirs to see
    expect(seenByViewer.transferPeer).toBeNull()
    // someone with access to both sides does see the link
    expect((await find(owner)).transferPeerId).toBeNull() // owner cannot see the importer's account either
  })
})

describe("subscriptions", () => {
  let subId: string
  beforeAll(async () => {
    const cp = uniqueIban()
    const today = new Date()
    const entries = [60, 30, 0].map((d) => ({ amount: "4.99", ind: "DBIT" as const, date: new Date(today.getTime() - d * 86_400_000).toISOString().slice(0, 10), ref: unique("s"), counterpartyIban: cp }))
    await owner.upload("/import", "s.xml", camt({ iban, entries }))
    subId = (await owner.get("/subscriptions")).body.find((s: any) => s.counterpartyIban === cp).id
  })

  test("viewers can read subscriptions and their transactions; strangers cannot", async () => {
    expect((await viewer.get("/subscriptions")).body.map((s: any) => s.id)).toContain(subId)
    expect((await stranger.get("/subscriptions")).body.map((s: any) => s.id)).not.toContain(subId)
    expect((await viewer.get(`/subscriptions/${subId}/transactions`)).status).toBe(200)
    expect((await stranger.get(`/subscriptions/${subId}/transactions`)).status).toBe(404)
  })

  test("viewers cannot change or delete, editors can", async () => {
    expect((await viewer.patch(`/subscriptions/${subId}`, { name: "x" })).status).toBe(404)
    expect((await viewer.del(`/subscriptions/${subId}`)).status).toBe(404)
    expect((await editor.patch(`/subscriptions/${subId}`, { name: "Renamed" })).body.name).toBe("Renamed")
  })

  test("creating a subscription needs edit rights on the account", async () => {
    expect((await viewer.post("/subscriptions", { accountId, counterpartyIban: "NL00NEW0000000001" })).status).toBe(403)
    expect((await stranger.post("/subscriptions", { accountId, counterpartyIban: "NL00NEW0000000001" })).status).toBe(403)
  })
})

/** Sharing rules that are identical for every shareable resource type. */
const resources = [
  { name: "crypto portfolios", base: "/crypto", create: (c: typeof owner) => c.post("/crypto", { name: unique("c") }), child: (id: string) => ({ path: `/crypto/${id}/trades`, body: { tradeDate: "2024-01-01", fromSymbol: "EUR", fromAmount: "100", toSymbol: "BTC", toAmount: "0.01" } }) },
  { name: "metal portfolios", base: "/metals", create: (c: typeof owner) => c.post("/metals", { name: unique("m") }), child: (id: string) => ({ path: `/metals/${id}/lots`, body: { purchaseDate: "2024-01-01", metal: "gold", weightPerPiece: "10", pricePerPiece: "500" } }) },
  { name: "stock portfolios", base: "/stocks", create: (c: typeof owner) => c.post("/stocks", { name: unique("s") }), child: (id: string) => ({ path: `/stocks/${id}/trades`, body: { tradeDate: "2024-01-01", type: "buy", symbol: "AAPL", quantity: "1", amount: "100" } }) },
  { name: "mortgages", base: "/mortgages", create: (c: typeof owner) => c.post("/mortgages", { name: unique("mo") }), child: (id: string) => ({ path: `/mortgages/${id}/parts`, body: { name: "p", type: "linear", principal: "1000", annualInterestRate: "0.05", startDate: "2024-01-01", endDate: "2034-01-01" } }) },
  { name: "loans", base: "/loans", create: (c: typeof owner) => c.post("/loans", { name: unique("lo") }), child: (id: string) => ({ path: `/loans/${id}/parts`, body: { name: "p", type: "linear", principal: "1000", annualInterestRate: "0.05", startDate: "2024-01-01", endDate: "2034-01-01" } }) },
]

for (const r of resources) {
  describe(`sharing: ${r.name}`, () => {
    let id: string
    beforeAll(async () => {
      id = (await r.create(owner)).body.id
      expect((await owner.post(`${r.base}/${id}/members`, { groupName: g.view, role: "viewer" })).status).toBe(201)
      expect((await owner.post(`${r.base}/${id}/members`, { groupName: g.edit, role: "editor" })).status).toBe(201)
    })
    const ids = async (c: typeof owner) => (await c.get(r.base)).body.map((x: any) => x.id)

    test("owner, viewer, editor and admin can see it — a stranger cannot", async () => {
      for (const who of [owner, viewer, editor, admin]) expect(await ids(who)).toContain(id)
      expect(await ids(stranger)).not.toContain(id)
    })

    test("canEdit / isOwner flags reflect the role", async () => {
      const flags = async (c: typeof owner) => { const x = (await c.get(r.base)).body.find((p: any) => p.id === id); return { canEdit: x.canEdit, isOwner: x.isOwner } }
      expect(await flags(owner)).toEqual({ canEdit: true, isOwner: true })
      expect(await flags(editor)).toEqual({ canEdit: true, isOwner: false })
      expect(await flags(viewer)).toEqual({ canEdit: false, isOwner: false })
      expect(await flags(admin)).toEqual({ canEdit: true, isOwner: true })
    })

    test("only editors (and owners/admins) can add data", async () => {
      const { path, body } = r.child(id)
      expect([403, 404]).toContain((await viewer.post(path, body)).status)
      expect([403, 404]).toContain((await stranger.post(path, body)).status)
      expect((await editor.post(path, body)).status).toBe(201)
      expect((await owner.post(path, body)).status).toBe(201)
    })

    test("editors cannot manage members or delete — only the owner (or an admin)", async () => {
      expect((await editor.post(`${r.base}/${id}/members`, { groupName: "sneaky" })).status).toBe(403)
      expect((await viewer.post(`${r.base}/${id}/members`, { groupName: "sneaky" })).status).toBe(403)
      expect((await editor.del(`${r.base}/${id}/members/${g.view}`)).status).toBe(403)
      expect([403, 404]).toContain((await editor.del(`${r.base}/${id}`)).status)
      expect([403, 404]).toContain((await viewer.del(`${r.base}/${id}`)).status)
    })

    test("a viewer cannot rename", async () => {
      expect([403, 404]).toContain((await viewer.patch(`${r.base}/${id}`, { name: "hijacked" })).status)
    })

    test("an admin can manage members and delete; afterwards the resource is gone", async () => {
      const fresh = (await r.create(owner)).body.id
      expect((await admin2.post(`${r.base}/${fresh}/members`, { groupName: g.view })).status).toBe(201)
      expect(await ids(viewer)).toContain(fresh)
      expect((await admin2.del(`${r.base}/${fresh}/members/${g.view}`)).status).toBe(204)
      expect(await ids(viewer)).not.toContain(fresh)
      expect((await admin2.del(`${r.base}/${fresh}`)).status).toBe(204)
      expect(await ids(owner)).not.toContain(fresh)
    })
  })
}

describe("admin endpoints", () => {
  test("only admins can use /admin", async () => {
    for (const who of [owner, viewer, editor]) {
      expect((await who.get("/admin/accounts")).status).toBe(403)
      expect((await who.get("/admin/sharing")).status).toBe(403)
      expect((await who.get("/admin/backup")).status).toBe(403)
    }
    expect((await admin.get("/admin/accounts")).status).toBe(200)
  })

  test("/me reports the permission flags derived from the user", async () => {
    expect((await admin.get("/me")).body).toMatchObject({ sub: "perm-admin", isAdmin: true, canImport: true })
    expect((await viewer.get("/me")).body).toMatchObject({ sub: "perm-viewer", isAdmin: false, canImport: false })
    expect((await importer.get("/me")).body).toMatchObject({ isAdmin: false, canImport: true })
  })

  test("users cannot change each other's theme (it is keyed by the caller)", async () => {
    await viewer.get("/me") // ensure a profile exists
    const r = await viewer.patch("/me", { theme: "dark" })
    expect(r.status).toBe(200)
    expect((await editor.get("/me")).body.theme).not.toBe("dark")
  })
})
