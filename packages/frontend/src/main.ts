import { createApp } from "vue"
import { createWebHistory } from "vue-router"
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query"
import App from "./App.vue"
import { authPlugin, createFakeAuth, createOidcAuth, getOidcConfig } from "./auth"
import { createAppRouter } from "./router"
import "./index.css"

// When VITE_AUTH_MODE=fake, skip OIDC entirely and use a static dev user.
// This avoids the need for a running Authentik instance during local development.
const auth = import.meta.env.VITE_AUTH_MODE === "fake" ? createFakeAuth() : createOidcAuth(getOidcConfig())

createApp(App)
  .use(VueQueryPlugin, { queryClient: new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: 1 } } }) })
  .use(createAppRouter(createWebHistory(), auth))
  .use(authPlugin(auth))
  .mount("#app")
