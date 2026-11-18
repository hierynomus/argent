/**
 * The one place that talks HTTP to the backend.
 *
 * The access token is read from a getter at request time (see `AuthBridge`), so API functions
 * never take a `token` argument and always use the *current* token — including one renewed
 * after the component that started the request last rendered.
 */
const BASE = "/api"

type TokenGetter = () => string | undefined
let tokenGetter: TokenGetter = () => undefined

/** Called once by `ApiAuthBridge`; replaces how the current access token is found. */
export function setTokenGetter(getter: TokenGetter) {
  tokenGetter = getter
}

/** An HTTP error from the API, carrying the status and the server's `{ error }` message. */
export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
    this.name = "ApiError"
  }
}

function authHeaders(): Record<string, string> {
  const token = tokenGetter()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      ...authHeaders(),
      ...(init.body && !(init.body instanceof FormData) ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new ApiError(err.error ?? "Request failed", res.status)
  }

  if (res.status === 204) return undefined as T
  return res.json()
}

const json = (body: unknown): RequestInit["body"] => JSON.stringify(body)

/** Thin verbs over `request`; bodies are JSON-encoded for you. */
export const http = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: "POST", body: body === undefined ? undefined : json(body) }),
  patch: <T>(path: string, body: unknown) => request<T>(path, { method: "PATCH", body: json(body) }),
  put: <T>(path: string, body: unknown) => request<T>(path, { method: "PUT", body: json(body) }),
  delete: <T = void>(path: string) => request<T>(path, { method: "DELETE" }),
  /** multipart/form-data upload of one file in the `file` field */
  upload: <T>(path: string, file: File) => {
    const form = new FormData()
    form.append("file", file)
    return request<T>(path, { method: "POST", body: form })
  },
}

/** Fetches a binary response and returns it with the server-suggested filename. */
export async function download(path: string, fallbackName: string): Promise<{ blob: Blob; filename: string }> {
  const res = await fetch(`${BASE}${path}`, { headers: authHeaders() })
  if (!res.ok) throw new ApiError("Download failed", res.status)
  const filename = res.headers.get("Content-Disposition")?.match(/filename="(.+?)"/)?.[1] ?? fallbackName
  return { blob: await res.blob(), filename }
}
