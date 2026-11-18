import { useRef, type ReactNode } from "react"
import { useAuth } from "react-oidc-context"
import { setTokenGetter } from "./client"

/**
 * Connects the OIDC session to the API client. Render it once, inside the auth provider and
 * above anything that fetches. The getter reads a ref that is refreshed on every render, so
 * requests always carry the latest token (including silently renewed ones).
 *
 * The getter is installed during render on purpose: children's effects (where queries start)
 * run before a parent's effects, so an effect here would be too late for the first request.
 */
export function ApiAuthBridge({ children }: { children: ReactNode }) {
  const auth = useAuth()
  const latest = useRef(auth)
  latest.current = auth
  setTokenGetter(() => latest.current.user?.access_token)
  return <>{children}</>
}
