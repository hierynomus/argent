import { describe, expect, test } from "bun:test"
import { zipSync, strToU8 } from "fflate"
import { camt, del, get, patch, post, put, unique, uniqueIban, upload, DEV_USER } from "../../test/helpers"

describe("health / error handling", () => {
  test("GET /health is public and returns ok", async () => {
    const { app } = await import("../../test/helpers")
    const res = await app.request("/health")
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: "ok" })
  })

  test("unknown routes return a JSON 404", async () => {
    const r = await get("/definitely-not-a-route")
    expect(r.status).toBe(404)
    expect(r.body).toEqual({ error: "Not found" })
  })

  test("malformed JSON is a 400 with a JSON error, not a 500", async () => {
    const { app } = await import("../../test/helpers")
    const res = await app.request("/api/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{not json",
    })
    expect(res.status).toBe(400)
    expect(typeof (await res.json()).error).toBe("string")
  })
})

describe("categories", () => {
  test("create → list → update → (validation) → ", async () => {
    const name = unique("cat")
    const created = await post("/categories", { name: `  ${name}  `, color: "#ff0000" })
    expect(created.status).toBe(201)
    expect(created.body.name).toBe(name) // trimmed
    expect(created.body.color).toBe("#ff0000")

    const list = await get("/categories")
    expect(list.status).toBe(200)
    expect(list.body.map((c: any) => c.id)).toContain(created.body.id)

    const updated = await put(`/categories/${created.body.id}`, { name: `${name}-renamed` })
    expect(updated.status).toBe(200)
    expect(updated.body.name).toBe(`${name}-renamed`)
    expect(updated.body.color).toBe("#ff0000") // untouched
  })

  test("child categories reference a parent", async () => {
    const parent = await post("/categories", { name: unique("parent") })
    const child = await post("/categories", { name: unique("child"), parentId: parent.body.id })
    expect(child.status).toBe(201)
    expect(child.body.parentId).toBe(parent.body.id)
  })

  test("rejects blank names and bad parent ids", async () => {
    const blank = await post("/categories", { name: "   " })
    expect(blank.status).toBe(400)
    expect(blank.body.error).toContain("name is required")
    expect(blank.body.issues[0].path).toBe("name")
    expect((await post("/categories", { name: "x", parentId: "nope" })).status).toBe(400)
    expect((await post("/categories", {})).status).toBe(400)
  })

  test("updating an unknown category is a 404", async () => {
    expect((await put("/categories/00000000-0000-0000-0000-000000000000", { name: "x" })).status).toBe(404)
  })
})

describe("me", () => {
  test("GET /me returns the identity and permission flags", async () => {
    const r = await get("/me")
    expect(r.status).toBe(200)
    expect(r.body).toMatchObject({ sub: DEV_USER, isAdmin: true, canImport: true })
  })

  test("PATCH /me updates the theme, and rejects invalid values", async () => {
    expect((await patch("/me", { theme: "dark" })).body.theme).toBe("dark")
    expect((await get("/me")).body.theme).toBe("dark")
    expect((await patch("/me", { theme: "light" })).body.theme).toBe("light")
    const bad = await patch("/me", { theme: "neon" })
    expect(bad.status).toBe(400)
    expect(bad.body.error).toBe("Invalid theme value")
    expect((await patch("/me", {})).status).toBe(400) // nothing to update
  })
})

describe("CAMT.053 import", () => {
  test("creates the account, imports transactions, sets the opening balance", async () => {
    const iban = uniqueIban()
    const xml = camt({
      iban,
      ownerName: "J Doe",
      opening: { amount: "100.00", date: "2024-01-01" },
      entries: [
        { amount: "25.00", ind: "DBIT", date: "2024-01-05", ref: "r1" },
        { amount: "50.00", ind: "CRDT", date: "2024-01-06", ref: "r2" },
      ],
    })
    const r = await upload("/import", "a.xml", xml)
    expect(r.status).toBe(201)
    expect(r.body).toEqual({ accountIban: iban, imported: 2, skipped: 0 })

    const accounts = await get("/accounts")
    const account = accounts.body.find((a: any) => a.iban === iban)
    expect(account).toBeDefined()
    expect(account.name).toBe("J Doe")
    expect(account.openingBalance).toBe("100.00")
    expect(account.openingBalanceDate).toBe("2024-01-01")
    expect(account.balance).toBe("125.00") // 100 - 25 + 50
  })

  test("re-importing the same file skips duplicates (idempotent)", async () => {
    const iban = uniqueIban()
    const xml = camt({ iban, entries: [{ amount: "9.99", ind: "DBIT", date: "2024-02-01", ref: "dup" }] })
    expect((await upload("/import", "a.xml", xml)).body).toMatchObject({ imported: 1, skipped: 0 })
    expect((await upload("/import", "a.xml", xml)).body).toMatchObject({ imported: 0, skipped: 1 })
  })

  test("a DBIT opening balance is stored as negative", async () => {
    const iban = uniqueIban()
    await upload("/import", "a.xml", camt({ iban, opening: { amount: "40.00", date: "2024-01-01", credit: false } }))
    const acc = (await get("/accounts")).body.find((a: any) => a.iban === iban)
    expect(acc.openingBalance).toBe("-40.00")
  })

  test("an earlier opening balance replaces a later one, a later one does not", async () => {
    const iban = uniqueIban()
    await upload("/import", "a.xml", camt({ iban, opening: { amount: "10.00", date: "2024-06-01" } }))
    await upload("/import", "b.xml", camt({ iban, opening: { amount: "99.00", date: "2024-09-01" } })) // later → ignored
    let acc = (await get("/accounts")).body.find((a: any) => a.iban === iban)
    expect(acc.openingBalanceDate).toBe("2024-06-01")
    await upload("/import", "c.xml", camt({ iban, opening: { amount: "5.00", date: "2024-01-01" } })) // earlier → wins
    acc = (await get("/accounts")).body.find((a: any) => a.iban === iban)
    expect(acc).toMatchObject({ openingBalance: "5.00", openingBalanceDate: "2024-01-01" })
  })

  test("invalid XML is a 422, missing file is a 400", async () => {
    expect((await upload("/import", "bad.xml", "<not-camt/>")).status).toBe(422)
    const { app } = await import("../../test/helpers")
    const res = await app.request("/api/import", { method: "POST", body: new FormData() })
    expect(res.status).toBe(400)
  })

  test("ZIP import processes every XML file and reports per-file results", async () => {
    const a = uniqueIban(), b = uniqueIban()
    const zip = zipSync({
      "b.xml": strToU8(camt({ iban: b, entries: [{ amount: "1.00", ind: "DBIT", date: "2024-03-01", ref: "z2" }] })),
      "a.xml": strToU8(camt({ iban: a, entries: [{ amount: "2.00", ind: "DBIT", date: "2024-03-01", ref: "z1" }] })),
      "broken.xml": strToU8("<oops/>"),
      "__MACOSX/ignored.xml": strToU8("<ignored/>"),
      "readme.txt": strToU8("ignore me"),
    })
    const r = await upload("/import/zip", "s.zip", zip, "application/zip")
    expect(r.status).toBe(201)
    expect(r.body.results.map((x: any) => x.filename)).toEqual(["a.xml", "b.xml"]) // sorted, filtered
    expect(r.body.results[0]).toMatchObject({ accountIban: a, imported: 1 })
    expect(r.body.errors).toHaveLength(1)
    expect(r.body.errors[0].filename).toBe("broken.xml")
  })

  test("ZIP without XML or an invalid ZIP is a 422", async () => {
    expect((await upload("/import/zip", "e.zip", zipSync({ "a.txt": strToU8("x") }), "application/zip")).status).toBe(422)
    expect((await upload("/import/zip", "bad.zip", "not a zip", "application/zip")).status).toBe(422)
  })
})

describe("accounts", () => {
  async function newAccount(entries: Parameters<typeof camt>[0]["entries"] = []) {
    const iban = uniqueIban()
    await upload("/import", "a.xml", camt({ iban, entries }))
    return (await get("/accounts")).body.find((a: any) => a.iban === iban)
  }

  test("GET /accounts/:id and 404 for unknown id", async () => {
    const acc = await newAccount()
    expect((await get(`/accounts/${acc.id}`)).body.iban).toBe(acc.iban)
    expect((await get("/accounts/00000000-0000-0000-0000-000000000000")).status).toBe(404)
  })

  test("PATCH updates name, type and opening balance; balance follows", async () => {
    const acc = await newAccount([{ amount: "10.00", ind: "CRDT", date: "2024-05-01", ref: unique("p") }])
    const r = await patch(`/accounts/${acc.id}`, { name: "  Savings pot ", type: "savings", openingBalance: "100.00", openingBalanceDate: "2024-01-01" })
    expect(r.status).toBe(200)
    expect(r.body).toMatchObject({ name: "Savings pot", type: "savings", openingBalance: "100.00", openingBalanceDate: "2024-01-01" })
    const listed = (await get("/accounts")).body.find((a: any) => a.id === acc.id)
    expect(listed.balance).toBe("110.00")
  })

  test("transactions before the opening balance date are excluded from the balance", async () => {
    const acc = await newAccount([
      { amount: "500.00", ind: "CRDT", date: "2023-12-31", ref: unique("old") },
      { amount: "20.00", ind: "DBIT", date: "2024-01-02", ref: unique("new") },
    ])
    await patch(`/accounts/${acc.id}`, { openingBalance: "1000.00", openingBalanceDate: "2024-01-01" })
    expect((await get("/accounts")).body.find((a: any) => a.id === acc.id).balance).toBe("980.00")
  })

  test("a blank name clears it; an empty body is rejected", async () => {
    const acc = await newAccount()
    await patch(`/accounts/${acc.id}`, { name: "x" })
    expect((await patch(`/accounts/${acc.id}`, { name: "   " })).body.name).toBeNull()
    expect((await patch(`/accounts/${acc.id}`, {})).status).toBe(400)
  })

  test("rejects invalid account values", async () => {
    const acc = await newAccount()
    expect((await patch(`/accounts/${acc.id}`, { type: "current" })).status).toBe(400)
    expect((await patch(`/accounts/${acc.id}`, { openingBalance: "lots" })).status).toBe(400)
    expect((await patch(`/accounts/${acc.id}`, { openingBalanceDate: "2024-13-40" })).status).toBe(400)
  })
})

describe("transactions", () => {
  async function seed() {
    const iban = uniqueIban()
    const tag = unique("t")
    await upload("/import", "a.xml", camt({
      iban,
      entries: [
        { amount: "10.00", ind: "DBIT", date: "2024-04-01", ref: `${tag}1`, description: `coffee ${tag}`, counterpartyName: "Cafe" },
        { amount: "20.00", ind: "DBIT", date: "2024-04-10", ref: `${tag}2`, description: `lunch ${tag}`, counterpartyName: "Deli" },
        { amount: "30.00", ind: "CRDT", date: "2024-04-20", ref: `${tag}3`, description: `refund ${tag}`, counterpartyName: "Shop" },
      ],
    }))
    const acc = (await get("/accounts")).body.find((a: any) => a.iban === iban)
    return { acc, tag }
  }

  test("lists newest first with pagination metadata", async () => {
    const { acc } = await seed()
    const r = await get(`/transactions?accountId=${acc.id}`)
    expect(r.status).toBe(200)
    expect(r.body.total).toBe(3)
    expect(r.body.data.map((t: any) => t.bookingDate)).toEqual(["2024-04-20", "2024-04-10", "2024-04-01"])
    expect(r.body.page).toBe(1)
  })

  test("paginates and caps pageSize at 200", async () => {
    const { acc } = await seed()
    const p1 = await get(`/transactions?accountId=${acc.id}&page=1&pageSize=2`)
    const p2 = await get(`/transactions?accountId=${acc.id}&page=2&pageSize=2`)
    expect(p1.body.data).toHaveLength(2)
    expect(p2.body.data).toHaveLength(1)
    expect(p1.body.total).toBe(3)
    expect((await get(`/transactions?accountId=${acc.id}&pageSize=9999`)).body.pageSize).toBe(200)
  })

  test("filters by date range, search text and several accounts", async () => {
    const { acc, tag } = await seed()
    expect((await get(`/transactions?accountId=${acc.id}&from=2024-04-05&to=2024-04-15`)).body.data).toHaveLength(1)
    expect((await get(`/transactions?accountId=${acc.id}&search=${tag}`)).body.total).toBe(3)
    expect((await get(`/transactions?accountId=${acc.id}&search=LUNCH`)).body.total).toBe(1) // case-insensitive
    const other = await seed()
    const both = await get(`/transactions?accountIds=${acc.id},${other.acc.id}`)
    expect(both.body.total).toBe(6)
  })

  test("categorise a transaction and filter by category / uncategorized", async () => {
    const { acc } = await seed()
    const cat = (await post("/categories", { name: unique("c") })).body
    const txs = (await get(`/transactions?accountId=${acc.id}`)).body.data
    const r = await patch(`/transactions/${txs[0].id}`, { categoryId: cat.id })
    expect(r.status).toBe(200)
    expect(r.body.categoryId).toBe(cat.id)
    expect((await get(`/transactions?accountId=${acc.id}&categoryId=${cat.id}`)).body.total).toBe(1)
    expect((await get(`/transactions?accountId=${acc.id}&categoryId=uncategorized`)).body.total).toBe(2)
    // and clear it again
    expect((await patch(`/transactions/${txs[0].id}`, { categoryId: null })).body.categoryId).toBeNull()
  })

  test("PATCH validates the category id and the transaction id", async () => {
    const { acc } = await seed()
    const tx = (await get(`/transactions?accountId=${acc.id}`)).body.data[0]
    expect((await patch(`/transactions/${tx.id}`, { categoryId: "nope" })).status).toBe(400)
    expect((await patch(`/transactions/${tx.id}`, {})).status).toBe(400)
    expect((await patch("/transactions/00000000-0000-0000-0000-000000000000", { categoryId: null })).status).toBe(404)
  })

  describe("transfers", () => {
    async function pair() {
      const a = uniqueIban(), b = uniqueIban(), tag = unique("x")
      await upload("/import", "a.xml", camt({ iban: a, entries: [{ amount: "75.00", ind: "DBIT", date: "2024-07-01", ref: `${tag}a` }] }))
      await upload("/import", "b.xml", camt({ iban: b, entries: [{ amount: "75.00", ind: "CRDT", date: "2024-07-02", ref: `${tag}b` }] }))
      const find = async (iban: string) => {
        const acc = (await get("/accounts")).body.find((x: any) => x.iban === iban)
        return (await get(`/transactions?accountId=${acc.id}`)).body.data[0]
      }
      return { debit: await find(a), credit: await find(b) }
    }

    test("suggestions list the opposite leg within ±3 days; link + unlink round trip", async () => {
      const { debit, credit } = await pair()
      const sugg = await get(`/transactions/${debit.id}/transfer-suggestions`)
      expect(sugg.status).toBe(200)
      expect(JSON.stringify(sugg.body)).toContain(credit.id)

      const linked = await post(`/transactions/${debit.id}/transfer`, { peerId: credit.id })
      expect(linked.status).toBe(200)
      expect(linked.body.transferPeerId).toBe(credit.id)
      const peer = (await get(`/transactions?accountId=${credit.accountId}`)).body.data[0]
      expect(peer.transferPeerId).toBe(debit.id) // symmetric

      // already linked → 409
      expect((await post(`/transactions/${debit.id}/transfer`, { peerId: credit.id })).status).toBe(409)

      const unlinked = await del(`/transactions/${debit.id}/transfer`)
      expect(unlinked.status).toBeLessThan(300)
      const after = (await get(`/transactions?accountId=${debit.accountId}`)).body.data[0]
      expect(after.transferPeerId).toBeNull()
    })

    test("validation: peerId must be a UUID; unknown peer is 404; unlinking an unlinked tx is 409", async () => {
      const { debit } = await pair()
      expect((await post(`/transactions/${debit.id}/transfer`, { peerId: "x" })).status).toBe(400)
      expect((await post(`/transactions/${debit.id}/transfer`, { peerId: "00000000-0000-0000-0000-000000000000" })).status).toBe(404)
      expect((await del(`/transactions/${debit.id}/transfer`)).status).toBe(409)
    })
  })
})

describe("subscriptions", () => {
  async function accountWithMonthlyPayments(counterpartyIban: string, amounts = ["9.99", "9.99", "9.99", "9.99"]) {
    const iban = uniqueIban()
    const today = new Date()
    const entries = amounts.map((amount, i) => {
      const d = new Date(today.getTime() - (amounts.length - 1 - i) * 30 * 86_400_000)
      return { amount, ind: "DBIT" as const, date: d.toISOString().slice(0, 10), ref: unique("s"), counterpartyIban, counterpartyName: "Streamly" }
    })
    await upload("/import", "a.xml", camt({ iban, entries }))
    return (await get("/accounts")).body.find((a: any) => a.iban === iban)
  }

  /** Same counterparty, but with gaps too irregular for the detector, so no candidate is created. */
  async function accountWithIrregularPayments(counterpartyIban: string) {
    const iban = uniqueIban()
    const mk = (date: string) => ({ amount: "12.00", ind: "DBIT" as const, date, ref: unique("i"), counterpartyIban, counterpartyName: "Gym" })
    await upload("/import", "a.xml", camt({ iban, entries: [mk("2024-01-01"), mk("2024-01-11"), mk("2024-05-10"), mk("2024-05-20")] }))
    return (await get("/accounts")).body.find((a: any) => a.iban === iban)
  }

  test("detect creates a candidate and links the payments; dismiss unlinks and sticks", async () => {
    const cp = uniqueIban()
    const acc = await accountWithMonthlyPayments(cp)
    await post("/subscriptions/detect")
    let subs = (await get("/subscriptions")).body.filter((s: any) => s.accountId === acc.id)
    expect(subs).toHaveLength(1)
    const sub = subs[0]
    expect(sub).toMatchObject({ counterpartyIban: cp, status: "candidate", intervalLabel: "monthly", medianAmount: "9.99" })

    const linked = await get(`/subscriptions/${sub.id}/transactions`)
    expect(linked.body).toHaveLength(4)

    const dismissed = await patch(`/subscriptions/${sub.id}`, { status: "dismissed" })
    expect(dismissed.body.status).toBe("dismissed")
    expect((await get(`/subscriptions/${sub.id}/transactions`)).body).toHaveLength(0)

    // dismissed subscriptions are hidden from the list...
    subs = (await get("/subscriptions")).body.filter((s: any) => s.accountId === acc.id)
    expect(subs).toHaveLength(0)

    // ...and the detector must not resurrect the pair as a new candidate or re-link its payments
    await post("/subscriptions/detect")
    subs = (await get("/subscriptions")).body.filter((s: any) => s.accountId === acc.id)
    expect(subs).toHaveLength(0)
    expect((await get(`/subscriptions/${sub.id}/transactions`)).body).toHaveLength(0)
  })

  test("confirm, rename and deactivate", async () => {
    const acc = await accountWithMonthlyPayments(uniqueIban())
    await post("/subscriptions/detect")
    const sub = (await get("/subscriptions")).body.find((s: any) => s.accountId === acc.id)
    const r = await patch(`/subscriptions/${sub.id}`, { status: "confirmed", name: "Streamly", isActive: false })
    expect(r.body).toMatchObject({ status: "confirmed", name: "Streamly", isActive: false })
    expect((await patch(`/subscriptions/${sub.id}`, {})).status).toBe(400)
    expect((await patch(`/subscriptions/${sub.id}`, { status: "candidate" })).status).toBe(400) // not allowed via API
  })

  test("irregular or too few payments are not detected", async () => {
    const iban = uniqueIban(), cp = uniqueIban()
    const mk = (date: string) => ({ amount: "12.00", ind: "DBIT" as const, date, ref: unique("i"), counterpartyIban: cp })
    // gaps of ~10 and ~120 days → irregular
    await upload("/import", "a.xml", camt({ iban, entries: [mk("2024-01-01"), mk("2024-01-11"), mk("2024-05-10")] }))
    await post("/subscriptions/detect")
    const acc = (await get("/accounts")).body.find((a: any) => a.iban === iban)
    expect((await get("/subscriptions")).body.filter((s: any) => s.accountId === acc.id)).toHaveLength(0)
  })

  test("manual create is confirmed + retroactively links; re-creating is idempotent; dismissed is re-confirmed", async () => {
    const cp = uniqueIban()
    const acc = await accountWithIrregularPayments(cp) // nothing detected automatically
    expect((await get("/subscriptions")).body.some((s: any) => s.accountId === acc.id)).toBe(false)

    const created = await post("/subscriptions", { accountId: acc.id, counterpartyIban: cp, name: "Manual" })
    expect(created.status).toBe(201)
    expect(created.body).toMatchObject({ status: "confirmed", name: "Manual" })
    expect((await get(`/subscriptions/${created.body.id}/transactions`)).body).toHaveLength(4)

    // creating it again is refused while it exists...
    expect((await post("/subscriptions", { accountId: acc.id, counterpartyIban: cp })).status).toBe(409)

    // ...but once dismissed it can be revived
    await patch(`/subscriptions/${created.body.id}`, { status: "dismissed" })
    const again = await post("/subscriptions", { accountId: acc.id, counterpartyIban: cp })
    expect(again.status).toBe(200) // existing record revived
    expect(again.body).toMatchObject({ id: created.body.id, status: "confirmed" })
  })

  test("manual create is refused (409) while a detected candidate exists for the pair — confirm the candidate instead", async () => {
    const cp = uniqueIban()
    const acc = await accountWithMonthlyPayments(cp) // detector creates a candidate right after the import
    const candidate = (await get("/subscriptions")).body.find((s: any) => s.accountId === acc.id)
    expect(candidate.status).toBe("candidate")
    const r = await post("/subscriptions", { accountId: acc.id, counterpartyIban: cp })
    expect(r.status).toBe(409)
    expect(r.body.error).toContain("already exists")
    expect((await patch(`/subscriptions/${candidate.id}`, { status: "confirmed" })).body.status).toBe("confirmed")
  })

  test("manual create validates input", async () => {
    const acc = await accountWithMonthlyPayments(uniqueIban())
    expect((await post("/subscriptions", { accountId: "nope", counterpartyIban: "x" })).status).toBe(400)
    expect((await post("/subscriptions", { accountId: acc.id, counterpartyIban: "  " })).status).toBe(400)
    expect((await post("/subscriptions", { accountId: "00000000-0000-0000-0000-000000000000", counterpartyIban: "NL1" })).status).toBe(403)
  })

  test("delete unlinks transactions and removes the subscription", async () => {
    const cp = uniqueIban()
    const acc = await accountWithIrregularPayments(cp)
    const sub = (await post("/subscriptions", { accountId: acc.id, counterpartyIban: cp })).body
    expect((await get(`/subscriptions/${sub.id}/transactions`)).body.length).toBeGreaterThan(0)
    expect((await del(`/subscriptions/${sub.id}`)).status).toBe(204)
    expect((await get("/subscriptions")).body.find((s: any) => s.id === sub.id)).toBeUndefined()
    const txs = (await get(`/transactions?accountId=${acc.id}`)).body.data
    expect(txs.every((t: any) => t.subscriptionId === null)).toBe(true)
  })
})

describe("import order independence", () => {
  test("monthly transfers are not left behind as a subscription when the receiving account is imported later", async () => {
    const a = uniqueIban(), b = uniqueIban()
    const today = new Date().toISOString().slice(0, 10)
    const days = [90, 60, 30, 0].map((d) => new Date(Date.parse(today) - d * 86_400_000).toISOString().slice(0, 10))
    const accountId = async () => (await get("/accounts")).body.find((x: any) => x.iban === a).id
    const entries = (ind: "DBIT" | "CRDT", cp: string) => days.map((date, i) => ({ amount: "250.00", ind, date, ref: `ORD-${a}-${i}`, counterpartyIban: cp }))

    await upload("/import", "a.xml", camt({ iban: a, entries: entries("DBIT", b) })) // B unknown yet → looks like payments to a stranger
    expect((await get("/subscriptions")).body.some((s: any) => s.counterpartyIban === b)).toBe(true) // detected as a (false) candidate

    await upload("/import", "b.xml", camt({ iban: b, entries: entries("CRDT", a) })) // now they are recognised as transfers
    const txs = (await get(`/transactions?accountId=${await accountId()}`)).body.data
    expect(txs.every((t: any) => t.transferPeerId)).toBe(true)
    expect((await get("/subscriptions")).body.some((s: any) => s.counterpartyIban === b)).toBe(false)
  })
})
