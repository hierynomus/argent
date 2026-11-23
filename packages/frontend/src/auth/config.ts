import type { UserManagerSettings } from "oidc-client-ts"

// These values are injected at runtime via window.__ENV__ (set by the nginx
// config from environment variables) so the same Docker image works across
// environments without a rebuild.
declare global {
  interface Window {
    __ENV__?: Record<string, string>
  }
}

function env(key: string): string {
  const val = window.__ENV__?.[key] ?? import.meta.env[key]
  if (!val) throw new Error(`Missing env var: ${key}`)
  return val
}

export function getOidcConfig(): UserManagerSettings {
  return {
    authority: env("VITE_AUTHENTIK_AUTHORITY"),
    client_id: env("VITE_AUTHENTIK_CLIENT_ID"),
    redirect_uri: `${window.location.origin}/auth/callback`,
    post_logout_redirect_uri: window.location.origin,
    response_type: "code",
    scope: "openid profile email",
    // Store tokens in session storage (cleared on tab close)
    userStore: undefined,
  }
}

/** True in the standalone/desktop app: one local user, its own server (set at runtime through /env-config.js). */
export const isLocalMode = (): boolean => window.__ENV__?.VITE_AUTH_MODE === "local"
