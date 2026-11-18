/**
 * A fake backend at the `fetch` level. Tests describe the API they expect and the UI is
 * exercised through its real network layer, so the tests keep working however the
 * frontend's API code is organised internally.
 *
 *   const api = mockApi({
 *     "GET /mortgages": [],
 *     "POST /mortgages": ({ body }) => ({ id: "m1", ...body }),
 *     "DELETE /mortgages/:id": respond(204),
 *   })
 *   ...
 *   expect(api.calls("POST", "/mortgages")[0].body).toEqual({ name: "House", currency: "EUR" })
 */
import { afterEach } from "vitest"

export interface MockRequest {
  method: string
  /** Path below /api, without the query string, e.g. `/mortgages/1/parts` */
  path: string
  params: Record<string, string>
  query: Record<string, string>
  body: any
  headers: Headers
}

/** An explicit response (use for non-200 statuses). */
export class Reply {
  constructor(public status: number, public body?: unknown) {}
}
export const respond = (status: number, body?: unknown) => new Reply(status, body)

type Handler = unknown | Reply | ((req: MockRequest) => unknown | Reply | Promise<unknown | Reply>)

const realFetch = globalThis.fetch
let installed: { restore: () => void } | null = null

function compile(pattern: string) {
  const [method, path] = pattern.split(" ")
  const names: string[] = []
  const regex = new RegExp(
    "^" + path.replace(/:[A-Za-z]+/g, (m) => { names.push(m.slice(1)); return "([^/]+)" }) + "/?$",
  )
  return { method, regex, names, pattern }
}

export function mockApi(routes: Record<string, Handler>) {
  installed?.restore()
  const compiled = Object.entries(routes).map(([k, h]) => ({ ...compile(k), handler: h }))
  const log: MockRequest[] = []
  const unmatched: string[] = []

  const impl = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, "http://localhost")
    const method = (init?.method ?? (typeof input === "object" && "method" in input ? input.method : "GET")).toUpperCase()
    const path = url.pathname.replace(/^\/api/, "") || "/"

    let body: any
    if (typeof init?.body === "string") { try { body = JSON.parse(init.body) } catch { body = init.body } }
    else if (init?.body instanceof FormData) body = init.body

    const route = compiled.find((r) => r.method === method && r.regex.test(path))
    const req: MockRequest = {
      method, path,
      params: route ? Object.fromEntries(route.names.map((n, i) => [n, decodeURIComponent(path.match(route.regex)![i + 1])])) : {},
      query: Object.fromEntries(url.searchParams),
      body,
      headers: new Headers(init?.headers),
    }
    log.push(req)

    if (!route) {
      unmatched.push(`${method} ${path}`)
      return new Response(JSON.stringify({ error: `No mock for ${method} ${path}` }), { status: 404, headers: { "Content-Type": "application/json" } })
    }
    let result = typeof route.handler === "function" ? await (route.handler as (r: MockRequest) => unknown)(req) : route.handler
    const reply = result instanceof Reply ? result : new Reply(200, result)
    if (reply.status === 204 || reply.body === undefined) return new Response(null, { status: reply.status === 200 ? 204 : reply.status })
    return new Response(JSON.stringify(reply.body), { status: reply.status, headers: { "Content-Type": "application/json" } })
  }

  globalThis.fetch = impl as typeof fetch
  installed = { restore: () => { globalThis.fetch = realFetch; installed = null } }

  return {
    /** Requests made so far, optionally filtered by method and path (string = exact, RegExp = test). */
    calls(method?: string, path?: string | RegExp) {
      return log.filter((r) => (!method || r.method === method) && (!path || (typeof path === "string" ? r.path === path : path.test(r.path))))
    },
    /** Requests nobody mocked (they got a 404). A well-behaved screen makes none. */
    unmatched,
    restore: () => installed?.restore(),
  }
}

afterEach(() => installed?.restore())
