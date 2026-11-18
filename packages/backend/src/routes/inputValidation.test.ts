import { describe, expect, test } from "bun:test"
import { strToU8, zipSync } from "fflate"
import { camt, clientAs, get, unique, uniqueIban, upload, user } from "../../test/helpers"
import { IMPORT_LIMITS } from "./import"

const MB = 1024 * 1024
const entry = (over: object = {}) => ({ amount: "10.00", ind: "DBIT" as const, date: "2024-05-01", ...over })

describe("GET /transactions: the query string is validated", () => {
  const bad = async (qs: string, message: string) => {
    const r = await get(`/transactions?${qs}`)
    expect({ qs, status: r.status }).toEqual({ qs, status: 400 })
    expect(r.body.error).toContain(message)
  }

  test("ids must be ids", async () => {
    await bad("accountId=nope", "accountId must be an id")
    await bad("accountIds=00000000-0000-4000-8000-000000000001,nope", "accountIds must be an id")
    await bad("categoryId=nope", 'categoryId must be an id or "uncategorized"')
  })

  test("dates must be real dates, in order", async () => {
    await bad("from=2024-02-31", "from is not a valid date")
    await bad("to=yesterday", "to must be a date")
    await bad("from=2024-06-01&to=2024-05-01", "from must not be after to")
  })

  test("page and pageSize must be positive whole numbers; a huge pageSize is capped, not refused", async () => {
    await bad("page=0", "page must be at least 1")
    await bad("page=abc", "page must be a number")
    await bad("page=1.5", "page must be a whole number")
    await bad("pageSize=0", "pageSize must be at least 1")
    await bad("pageSize=ten", "pageSize must be a number")
    const capped = await get("/transactions?pageSize=9999")
    expect(capped.status).toBe(200)
    expect(capped.body.pageSize).toBe(200)
    expect((await get("/transactions")).body).toMatchObject({ page: expect.any(Number), pageSize: expect.any(Number) })
  })

  test("a too long search is refused", async () => {
    await bad(`search=${"x".repeat(201)}`, "search is too long")
  })

  test("empty values mean 'not set' (as the frontend and plain forms send them)", async () => {
    const r = await get("/transactions?accountId=&accountIds=&categoryId=&from=&to=&search=&page=&pageSize=")
    expect(r.status).toBe(200)
  })

  test("all the valid filters together are accepted", async () => {
    const id = "00000000-0000-4000-8000-000000000001"
    const r = await get(`/transactions?accountId=${id}&categoryId=uncategorized&from=2024-01-01&to=2024-12-31&search=coffee&page=2&pageSize=10`)
    expect(r.status).toBe(200)
    expect(r.body).toMatchObject({ page: 2, pageSize: 10 })
  })
})

describe("GET /transactions: what the filters do", () => {
  test("asking only for accounts you cannot see gives nothing — not everything you can see", async () => {
    const importer = clientAs(user(unique("importer"), [], { canImport: true }))
    const mine = uniqueIban()
    await importer.upload("/import", "mine.xml", camt({ iban: mine, entries: [entry({ ref: unique("r") })] }))
    const other = uniqueIban() // an account the importer was not given access to (the dev admin imports it)
    await upload("/import", "other.xml", camt({ iban: other, entries: [entry({ ref: unique("r") })] }))
    const theirs = (await get("/accounts")).body.find((a: any) => a.iban === other)

    const own = await importer.get("/transactions")
    expect(own.body.total).toBeGreaterThan(0) // they do see their own account...
    const r = await importer.get(`/transactions?accountIds=${theirs.id}`)
    expect(r.body).toMatchObject({ data: [], total: 0 }) // ...but asking for someone else's gives nothing
    expect((await importer.get(`/transactions?accountId=${theirs.id}`)).body.total).toBe(0)
  })

  test("% and _ in the search text are plain characters, not wildcards", async () => {
    const iban = uniqueIban(), tag = unique("w")
    await upload("/import", "w.xml", camt({ iban, entries: [
      entry({ ref: `${tag}1`, description: `${tag} 50% off` }),
      entry({ ref: `${tag}2`, description: `${tag} 5000 off` }),
      entry({ ref: `${tag}3`, description: `${tag} a_b` }),
      entry({ ref: `${tag}4`, description: `${tag} axb` }),
    ] }))
    const search = async (text: string) => (await get(`/transactions?search=${encodeURIComponent(text)}`)).body.data.map((t: any) => t.description)
    expect(await search(`${tag} 50%`)).toEqual([`${tag} 50% off`]) // an unescaped % would also match "5000 off"
    expect(await search(`${tag} a_b`)).toEqual([`${tag} a_b`]) // an unescaped _ would also match "axb"
    expect((await search(`${tag} %`)).length).toBe(0) // a lone % does not mean "everything"
  })
})

describe("import uploads are validated", () => {
  test("an empty file is refused", async () => {
    const r = await upload("/import", "empty.xml", "")
    expect(r.status).toBe(400)
    expect(r.body.error).toContain("empty")
  })

  test("something that is not XML says so, instead of a parser message", async () => {
    const r = await upload("/import", "notes.xml", '{"this": "is json"}')
    expect(r.status).toBe(422)
    expect(r.body.error).toContain("does not look like an XML file")
  })

  test("a byte-order mark and leading whitespace before the XML are fine", async () => {
    const r = await upload("/import", "bom.xml", `﻿\n  ${camt({ iban: uniqueIban(), entries: [entry({ ref: unique("r") })] })}`)
    expect(r.status).toBe(201)
    expect(r.body.imported).toBe(1)
  })

  test("a file over the size limit is refused with 413 before it is parsed", async () => {
    const r = await upload("/import", "huge.xml", `<${" ".repeat(IMPORT_LIMITS.xmlBytes + 1)}`)
    expect(r.status).toBe(413)
    expect(r.body.error).toContain("too large")
  })

  test("a file just under the limit is still read", async () => {
    const r = await upload("/import", "big.xml", `<Document>${" ".repeat(IMPORT_LIMITS.xmlBytes - 1000)}</Document>`)
    expect(r.status).toBe(422) // size is fine; it is simply not a statement
    expect(r.body.error).toContain("Failed to parse")
  })
})

describe("zip uploads are validated", () => {
  const xml = (iban = uniqueIban()) => camt({ iban, entries: [entry({ ref: unique("r") })] })
  const zip = (files: Record<string, string | Uint8Array>) => zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, typeof v === "string" ? strToU8(v) : v])))

  test("empty and non-zip files are refused", async () => {
    expect((await upload("/import/zip", "a.zip", "")).status).toBe(400)
    const r = await upload("/import/zip", "a.zip", "this is not a zip", "application/zip")
    expect(r.status).toBe(422)
    expect(r.body.error).toContain("does not look like a ZIP")
  })

  test("a normal archive of statements is imported", async () => {
    const r = await upload("/import/zip", "ok.zip", zip({ "a.xml": xml(), "b.xml": xml() }), "application/zip")
    expect(r.status).toBe(201)
    expect(r.body.results).toHaveLength(2)
  })

  test("a zip bomb is refused up front: a tiny archive of one huge statement", async () => {
    const bomb = zip({ "huge.xml": new Uint8Array(IMPORT_LIMITS.xmlBytes + 1) }) // ~10 kB zipped, over 10 MB unzipped
    expect(bomb.length).toBeLessThan(100_000)
    const r = await upload("/import/zip", "bomb.zip", bomb, "application/zip")
    expect(r.status).toBe(413)
    expect(r.body.error).toContain("huge.xml")
  })

  test("so is an archive whose statements together expand past the total limit", async () => {
    const part = new Uint8Array(9 * MB)
    const files = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`s${i}.xml`, part])) // 108 MB expanded, a few hundred kB zipped
    const r = await upload("/import/zip", "many.zip", zip(files), "application/zip")
    expect(r.status).toBe(413)
    expect(r.body.error).toContain("expands to more than 100 MB")
  }, 60_000)

  test("and one with too many entries", async () => {
    const files = Object.fromEntries(Array.from({ length: IMPORT_LIMITS.zipEntries + 1 }, (_, i) => [`s${i}.xml`, "<a/>"]))
    const r = await upload("/import/zip", "entries.zip", zip(files), "application/zip")
    expect(r.status).toBe(413)
    expect(r.body.error).toContain("more than 1000 statements")
  }, 60_000)

  test("files that are not statements (macOS metadata, other types) are ignored, and an archive with none says so", async () => {
    const r = await upload("/import/zip", "none.zip", zip({ "readme.txt": "hi", "__MACOSX/a.xml": "<a/>" }), "application/zip")
    expect(r.status).toBe(422)
    expect(r.body.error).toContain("No XML files")
  })
})
