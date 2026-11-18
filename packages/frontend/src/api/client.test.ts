import { afterEach, beforeEach, describe, expect, test } from "vitest"
import { mockApi, respond } from "../../test/fakeApi"
import { ApiError, download, http, request, setTokenGetter } from "./client"

// the token getter is module-level state: start every test from "signed out", whatever ran before
beforeEach(() => setTokenGetter(() => undefined))
afterEach(() => setTokenGetter(() => undefined))

describe("authentication header", () => {
  test("sends the bearer token from the getter", async () => {
    const api = mockApi({ "GET /ping": { ok: true } })
    setTokenGetter(() => "abc123")
    await http.get("/ping")
    expect(api.calls()[0].headers.get("Authorization")).toBe("Bearer abc123")
  })

  test("reads the token at request time, so a renewed token is used immediately", async () => {
    const api = mockApi({ "GET /ping": {} })
    let token = "old"
    setTokenGetter(() => token)
    await http.get("/ping")
    token = "renewed"
    await http.get("/ping")
    expect(api.calls().map((c) => c.headers.get("Authorization"))).toEqual(["Bearer old", "Bearer renewed"])
  })

  test("sends no Authorization header when there is no token", async () => {
    const api = mockApi({ "GET /ping": {} })
    await http.get("/ping")
    expect(api.calls()[0].headers.has("Authorization")).toBe(false)
  })
})

describe("request bodies", () => {
  test("JSON bodies are encoded and labelled", async () => {
    const api = mockApi({ "POST /things": ({ body }: any) => body })
    const out = await http.post("/things", { a: 1 })
    expect(out).toEqual({ a: 1 })
    expect(api.calls()[0].headers.get("Content-Type")).toBe("application/json")
    expect(api.calls()[0].body).toEqual({ a: 1 })
  })

  test("a POST without a body sends none (and no content type)", async () => {
    const api = mockApi({ "POST /detect": { detected: 0 } })
    await http.post("/detect")
    expect(api.calls()[0].body).toBeUndefined()
    expect(api.calls()[0].headers.has("Content-Type")).toBe(false)
  })

  test("each verb uses its own method", async () => {
    const api = mockApi({ "GET /x": {}, "POST /x": {}, "PATCH /x": {}, "PUT /x": {}, "DELETE /x": respond(204) })
    await http.get("/x"); await http.post("/x", {}); await http.patch("/x", {}); await http.put("/x", {}); await http.delete("/x")
    expect(api.calls().map((c) => c.method)).toEqual(["GET", "POST", "PATCH", "PUT", "DELETE"])
  })

  test("uploads use multipart form data under the `file` field, with no JSON content type", async () => {
    const api = mockApi({ "POST /import": { imported: 1 } })
    const file = new File(["<xml/>"], "s.xml", { type: "application/xml" })
    await http.upload("/import", file)
    const sent = api.calls()[0]
    expect(sent.body).toBeInstanceOf(FormData)
    expect((sent.body as FormData).get("file")).toBeInstanceOf(File)
    expect(sent.headers.get("Content-Type")).not.toBe("application/json")
  })

  test("caller-supplied headers win", async () => {
    const api = mockApi({ "GET /x": {} })
    await request("/x", { headers: { "X-Test": "1" } })
    expect(api.calls()[0].headers.get("X-Test")).toBe("1")
  })
})

describe("responses and errors", () => {
  test("204 resolves to undefined", async () => {
    mockApi({ "DELETE /x": respond(204) })
    expect(await http.delete("/x")).toBeUndefined()
  })

  test("an error response becomes an ApiError carrying the server's message and the status", async () => {
    mockApi({ "GET /x": respond(409, { error: "Already exists" }) })
    const err = (await http.get("/x").catch((e: unknown) => e)) as ApiError
    expect(err).toBeInstanceOf(ApiError)
    expect(err).toBeInstanceOf(Error)
    expect(err.message).toBe("Already exists")
    expect(err.status).toBe(409)
    expect(err.name).toBe("ApiError")
  })

  test("a non-JSON error body falls back to the status text", async () => {
    const orig = globalThis.fetch
    globalThis.fetch = (async () => new Response("<html>bad gateway</html>", { status: 502, statusText: "Bad Gateway" })) as unknown as typeof fetch
    try {
      const err = (await http.get("/x").catch((e: unknown) => e)) as ApiError
      expect(err.message).toBe("Bad Gateway")
      expect(err.status).toBe(502)
    } finally { globalThis.fetch = orig }
  })

  test("a JSON error without an `error` field still produces a message", async () => {
    mockApi({ "GET /x": respond(500, { oops: true }) })
    const err = (await http.get("/x").catch((e: unknown) => e)) as ApiError
    expect(err.message).toBe("Request failed")
  })

  test("successful JSON is returned parsed", async () => {
    mockApi({ "GET /x": { list: [1, 2, 3] } })
    expect(await http.get<{ list: number[] }>("/x")).toEqual({ list: [1, 2, 3] })
  })
})

describe("download", () => {
  test("returns the blob and the filename from Content-Disposition", async () => {
    const orig = globalThis.fetch
    globalThis.fetch = (async () => new Response("data", { headers: { "Content-Disposition": 'attachment; filename="backup-1.json"' } })) as unknown as typeof fetch
    try {
      const { blob, filename } = await download("/admin/backup", "fallback.json")
      expect(filename).toBe("backup-1.json")
      expect(await blob.text()).toBe("data")
    } finally { globalThis.fetch = orig }
  })

  test("uses the fallback name when the header is missing, and fails on an error status", async () => {
    const orig = globalThis.fetch
    globalThis.fetch = (async () => new Response("data")) as unknown as typeof fetch
    try {
      expect((await download("/x", "fallback.json")).filename).toBe("fallback.json")
      globalThis.fetch = (async () => new Response("no", { status: 403 })) as unknown as typeof fetch
      const err = (await download("/x", "f").catch((e: unknown) => e)) as ApiError
      expect(err).toBeInstanceOf(ApiError)
      expect(err.status).toBe(403)
    } finally { globalThis.fetch = orig }
  })

  test("sends the token too", async () => {
    const orig = globalThis.fetch
    let seen: HeadersInit | undefined
    globalThis.fetch = (async (_: any, init?: RequestInit) => { seen = init?.headers; return new Response("x") }) as unknown as typeof fetch
    setTokenGetter(() => "tok")
    try {
      await download("/x", "f")
      expect(seen).toEqual({ Authorization: "Bearer tok" })
    } finally { globalThis.fetch = orig }
  })
})
