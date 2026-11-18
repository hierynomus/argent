import { createApp } from "../src/app"
import type { AuthUser } from "../src/middleware/auth"
import { settleBackgroundJobs } from "../src/services/backgroundJobs"

/** The real app (all routes + error handling). Auth is `AUTH_MODE=fake` → static admin user "dev-user". */
export const app = createApp()

export const DEV_USER = "dev-user"

export interface ApiResponse<T = any> {
  status: number
  body: T
  res: Response
}

/** Calls the API under `/api` and parses the JSON body (null for empty responses). */
export async function api<T = any>(method: string, path: string, body?: unknown): Promise<ApiResponse<T>> {
  const res = await app.request(`/api${path}`, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let parsed: any = null
  try { parsed = text ? JSON.parse(text) : null } catch { parsed = text }
  return { status: res.status, body: parsed, res }
}

export const get = <T = any>(path: string) => api<T>("GET", path)
export const post = <T = any>(path: string, body?: unknown) => api<T>("POST", path, body ?? {})
export const patch = <T = any>(path: string, body: unknown) => api<T>("PATCH", path, body)
export const put = <T = any>(path: string, body: unknown) => api<T>("PUT", path, body)
export const del = <T = any>(path: string) => api<T>("DELETE", path)

/** POSTs a file as multipart/form-data (the import endpoints). */
export async function upload(path: string, filename: string, content: string | Uint8Array, mime = "application/xml") {
  const form = new FormData()
  form.set("file", new File([content as BlobPart], filename, { type: mime }))
  const res = await app.request(`/api${path}`, { method: "POST", body: form })
  const text = await res.text()
  await settleBackgroundJobs() // imports trigger transfer-linking + subscription detection; make tests deterministic
  return { status: res.status, body: text ? JSON.parse(text) : null }
}

let counter = 0
/** A string that is unique within this test run. */
export const unique = (prefix = "x") => `${prefix}${Date.now().toString(36)}${(counter++).toString(36)}`

/** A syntactically valid, unique IBAN-ish string. */
export const uniqueIban = () => `NL${String(Date.now()).slice(-6)}TEST${String(counter++).padStart(6, "0")}`

export interface CamtEntry {
  amount: string
  ind: "CRDT" | "DBIT"
  date: string
  ref?: string
  description?: string
  counterpartyName?: string
  counterpartyIban?: string
}

/** Builds a minimal CAMT.053 document. */
export function camt(opts: { iban: string; entries?: CamtEntry[]; opening?: { amount: string; date: string; credit?: boolean }; ownerName?: string }) {
  const entries = (opts.entries ?? []).map((e) => `
    <Ntry>
      <Amt Ccy="EUR">${e.amount}</Amt>
      <CdtDbtInd>${e.ind}</CdtDbtInd>
      <BookgDt><Dt>${e.date}</Dt></BookgDt>
      <NtryDtls><TxDtls>
        <Refs><EndToEndId>${e.ref ?? "NOTPROVIDED"}</EndToEndId></Refs>
        <RltdPties>
          <Cdtr><Nm>${e.counterpartyName ?? "Counterparty"}</Nm></Cdtr>
          <CdtrAcct><Id><IBAN>${e.counterpartyIban ?? "NL99CPTY0000000001"}</IBAN></Id></CdtrAcct>
          <Dbtr><Nm>${e.counterpartyName ?? "Counterparty"}</Nm></Dbtr>
          <DbtrAcct><Id><IBAN>${e.counterpartyIban ?? "NL99CPTY0000000001"}</IBAN></Id></DbtrAcct>
        </RltdPties>
        <RmtInf><Ustrd>${e.description ?? "payment"}</Ustrd></RmtInf>
      </TxDtls></NtryDtls>
    </Ntry>`).join("")
  const bal = opts.opening
    ? `<Bal><Tp><CdOrPrtry><Cd>OPBD</Cd></CdOrPrtry></Tp><Amt Ccy="EUR">${opts.opening.amount}</Amt><CdtDbtInd>${opts.opening.credit === false ? "DBIT" : "CRDT"}</CdtDbtInd><Dt><Dt>${opts.opening.date}</Dt></Dt></Bal>`
    : ""
  return `<?xml version="1.0"?><Document><BkToCstmrStmt><Stmt>
    <Acct><Id><IBAN>${opts.iban}</IBAN></Id><Ccy>EUR</Ccy>${opts.ownerName ? `<Ownr><Nm>${opts.ownerName}</Nm></Ownr>` : ""}</Acct>
    ${bal}${entries}
  </Stmt></BkToCstmrStmt></Document>`
}

/** Builds a user for role tests. */
export const user = (sub: string, groups: string[] = [], opts: { isAdmin?: boolean; canImport?: boolean } = {}): AuthUser => ({
  sub,
  groups,
  isAdmin: opts.isAdmin ?? false,
  canImport: opts.canImport ?? opts.isAdmin ?? false,
})

/** A client that talks to the real app *as the given user* (no JWT involved). */
export function clientAs(u: AuthUser) {
  const asApp = createApp({ auth: async (c, next) => { c.set("user" as never, u as never); await next() } })
  async function call<T = any>(method: string, path: string, body?: unknown): Promise<ApiResponse<T>> {
    const res = await asApp.request(`/api${path}`, {
      method,
      headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
    const text = await res.text()
    let parsed: any = null
    try { parsed = text ? JSON.parse(text) : null } catch { parsed = text }
    return { status: res.status, body: parsed, res }
  }
  return {
    get: <T = any>(path: string) => call<T>("GET", path),
    post: <T = any>(path: string, body?: unknown) => call<T>("POST", path, body ?? {}),
    patch: <T = any>(path: string, body: unknown) => call<T>("PATCH", path, body),
    put: <T = any>(path: string, body: unknown) => call<T>("PUT", path, body),
    del: <T = any>(path: string) => call<T>("DELETE", path),
    async upload(path: string, filename: string, content: string) {
      const form = new FormData()
      form.set("file", new File([content], filename, { type: "application/xml" }))
      const res = await asApp.request(`/api${path}`, { method: "POST", body: form })
      const text = await res.text()
      await settleBackgroundJobs()
      return { status: res.status, body: text ? JSON.parse(text) : null }
    },
  }
}
