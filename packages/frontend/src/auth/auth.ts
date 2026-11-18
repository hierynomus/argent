import { computed, inject, reactive, type App, type InjectionKey } from "vue"
import { UserManager, type User, type UserManagerSettings } from "oidc-client-ts"
import { setTokenGetter } from "../api/client"

/** The slice of an OIDC user the app uses. */
export interface AuthUser {
  access_token: string
  profile: { sub?: string; email?: string; name?: string; groups?: string[] }
}

/**
 * The signed-in session, as a reactive object (use it in templates and scripts alike):
 *
 *   const auth = useAuth()
 *   auth.isAuthenticated, auth.user?.profile.email, await auth.signoutRedirect()
 */
export interface Auth {
  user: AuthUser | null
  /** true until the stored session (if any) has been looked up */
  isLoading: boolean
  error: Error | null
  readonly isAuthenticated: boolean
  /** resolves when the initial session lookup is done */
  ready: Promise<void>
  signinRedirect: () => Promise<void>
  /** completes the redirect back from the identity provider (the /auth/callback page) */
  signinCallback: () => Promise<void>
  signoutRedirect: () => Promise<void>
}

export const AUTH_KEY: InjectionKey<Auth> = Symbol("auth")

/** Gives components access to the session. Throws if no auth was installed (a wiring bug, not a runtime state). */
export function useAuth(): Auth {
  const auth = inject(AUTH_KEY)
  if (!auth) throw new Error("useAuth() needs an auth: install one with app.use(authPlugin(auth))")
  return auth
}

export const authPlugin = (auth: Auth) => ({
  install(app: App) {
    app.provide(AUTH_KEY, auth)
  },
})

/** Builds the reactive session object and points the API client at its access token. */
function createSession(init: Partial<Pick<Auth, "user" | "isLoading" | "error">> & Pick<Auth, "ready" | "signinRedirect" | "signinCallback" | "signoutRedirect">): Auth {
  const state = reactive({
    user: init.user ?? null,
    isLoading: init.isLoading ?? false,
    error: init.error ?? null,
    isAuthenticated: computed(() => state.user !== null),
    ready: init.ready,
    signinRedirect: init.signinRedirect,
    signinCallback: init.signinCallback,
    signoutRedirect: init.signoutRedirect,
  }) as unknown as Auth
  // read at request time, so a silently renewed token is used immediately
  setTokenGetter(() => state.user?.access_token)
  return state
}

const toAuthUser = (u: User | null): AuthUser | null => (u && !u.expired ? (u as unknown as AuthUser) : null)

/** The real thing: authorization-code flow against the configured identity provider (Authentik). */
export function createOidcAuth(settings: UserManagerSettings): Auth {
  const manager = new UserManager(settings)
  const auth = createSession({
    isLoading: true,
    ready: Promise.resolve(),
    signinRedirect: () => manager.signinRedirect(),
    signinCallback: async () => {
      try {
        auth.user = toAuthUser(await manager.signinRedirectCallback())
      } catch (e) {
        auth.error = e instanceof Error ? e : new Error(String(e))
      }
    },
    signoutRedirect: () => manager.signoutRedirect(),
  })

  // renewal and sign-out elsewhere arrive as events
  manager.events.addUserLoaded((u) => {
    auth.user = toAuthUser(u)
  })
  manager.events.addUserUnloaded(() => {
    auth.user = null
  })
  manager.events.addSilentRenewError((e) => {
    auth.error = e
  })

  auth.ready = manager
    .getUser()
    .then((u) => {
      auth.user = toAuthUser(u)
    })
    .catch((e) => {
      auth.error = e instanceof Error ? e : new Error(String(e))
    })
    .finally(() => {
      auth.isLoading = false
    })
  return auth
}

/**
 * A signed-in dev user with no identity provider (VITE_AUTH_MODE=fake). The token is accepted by the
 * backend when it runs with AUTH_MODE=fake. Tests use the overrides to be any user.
 */
export function createFakeAuth(
  overrides: { user?: AuthUser | null; token?: string; signoutRedirect?: () => Promise<void>; signinRedirect?: () => Promise<void> } = {},
): Auth {
  const user =
    overrides.user !== undefined
      ? overrides.user
      : {
          access_token: overrides.token ?? "dev-fake-token",
          profile: { sub: "dev-user", email: "dev@localhost", name: "Dev User", groups: ["argent-admin", "argent-import"] },
        }
  return createSession({
    user,
    ready: Promise.resolve(),
    signinRedirect: overrides.signinRedirect ?? (async () => {}),
    signinCallback: async () => {},
    signoutRedirect: overrides.signoutRedirect ?? (async () => {}),
  })
}
