import { createApp } from "vue"
import { createWebHistory } from "vue-router"
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query"
import App from "./App.vue"
import { authPlugin, createFakeAuth, createOidcAuth, getOidcConfig } from "./auth"
import { createAppRouter } from "./router"
import "./index.css"

// When VITE_AUTH_MODE=fake, skip OIDC entirely and use a static dev user.
// This avoids the need for a running Authentik instance during local development.
// The standalone app (VITE_AUTH_MODE=local, set at runtime by its own server through /env-config.js) has no login
// either: its backend only listens on this computer.
const authMode = window.__ENV__?.VITE_AUTH_MODE ?? import.meta.env.VITE_AUTH_MODE
const auth = authMode === "fake" || authMode === "local" ? createFakeAuth() : createOidcAuth(getOidcConfig())

createApp(App)
  .use(VueQueryPlugin, { queryClient: new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: 1 } } }) })
  .use(createAppRouter(createWebHistory(), auth))
  .use(authPlugin(auth))
  .mount("#app")
