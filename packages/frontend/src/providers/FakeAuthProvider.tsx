/**
 * FakeAuthProvider — used when VITE_AUTH_MODE=fake.
 *
 * Provides to the real react-oidc-context AuthContext so that useAuth() works
 * transparently in all pages without any import changes.
 * The fake access token is accepted by the backend when AUTH_MODE=fake.
 */
import { AuthContext } from "react-oidc-context"
import type { AuthContextProps } from "react-oidc-context"

const noop = async () => {}

const fakeContext: AuthContextProps = {
  isAuthenticated: true,
  isLoading: false,
  error: undefined,
  activeNavigator: undefined,
  user: {
    access_token: "dev-fake-token",
    token_type: "Bearer",
    profile: {
      sub: "dev-user",
      iss: "fake",
      aud: "fake",
      exp: 9999999999,
      iat: 0,
      email: "dev@localhost",
      name: "Dev User",
      groups: ["argent-admin", "argent-import"],
    },
    // Stub out oidc-client-ts User methods
    expired: false,
    scopes: [],
    state: undefined,
    id_token: undefined,
    refresh_token: undefined,
    session_state: null,
    toStorageString: () => "",
  } as unknown as AuthContextProps["user"],
  signinRedirect: noop,
  signinPopup: noop,
  signinSilent: noop,
  signoutRedirect: noop,
  signoutPopup: noop,
  signoutSilent: noop,
  signinResourceOwnerCredentials: noop,
  clearStaleState: noop,
  removeUser: noop,
  revokeTokens: noop,
  startSilentRenew: () => {},
  stopSilentRenew: () => {},
  events: {} as AuthContextProps["events"],
}

export function FakeAuthProvider({ children }: { children: React.ReactNode }) {
  return (
    <AuthContext.Provider value={fakeContext}>
      {children}
    </AuthContext.Provider>
  )
}
