import { createRouter, type RouterHistory } from "vue-router"
import type { Auth } from "./auth"

// Each page is its own chunk, loaded when first visited, so the initial download stays small.
export const routes = [
  { path: "/auth/callback", component: () => import("./pages/AuthCallback.vue"), meta: { public: true } },
  { path: "/", redirect: "/dashboard" },
  { path: "/dashboard", component: () => import("./pages/Dashboard.vue") },
  { path: "/overview", component: () => import("./pages/Overview.vue") },
  // the old, simpler transactions list was folded into the overview
  { path: "/transactions", redirect: "/overview" },
  { path: "/admin", component: () => import("./pages/Admin.vue") },
  { path: "/profile", component: () => import("./pages/Profile.vue") },
  { path: "/checking", component: () => import("./pages/Checking.vue") },
  { path: "/savings", component: () => import("./pages/Savings.vue") },
  { path: "/subscriptions", component: () => import("./pages/Subscriptions.vue") },
  { path: "/settings", component: () => import("./pages/Settings.vue") },
  { path: "/mortgages", component: () => import("./pages/Mortgages.vue") },
  { path: "/loans", component: () => import("./pages/Loans.vue") },
  { path: "/crypto", component: () => import("./pages/Crypto.vue") },
  { path: "/metals", component: () => import("./pages/Metals.vue") },
  { path: "/stocks", component: () => import("./pages/Stocks.vue") },
  { path: "/property", component: () => import("./pages/Property.vue") },
]

/** The app's router. Every page except the sign-in callback needs a session: without one, go sign in. */
export function createAppRouter(history: RouterHistory, auth: Auth) {
  const router = createRouter({ history, routes })
  router.beforeEach(async (to) => {
    if (to.meta.public) return true
    await auth.ready
    if (auth.error) return true // App shows the error instead of the page
    if (!auth.isAuthenticated) {
      await auth.signinRedirect()
      return false
    }
    return true
  })
  return router
}
