import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { AuthProvider } from "react-oidc-context"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { FakeAuthProvider } from "./providers/FakeAuthProvider"
import { getOidcConfig } from "./auth"
import App from "./App"
import "./index.css"

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1 },
  },
})

const isFakeAuth = import.meta.env.VITE_AUTH_MODE === "fake"

// When VITE_AUTH_MODE=fake, skip OIDC entirely and use a static dev user.
// This avoids the need for a running Authentik instance during local development.
const Provider = isFakeAuth
  ? ({ children }: { children: React.ReactNode }) => (
      <FakeAuthProvider>{children}</FakeAuthProvider>
    )
  : ({ children }: { children: React.ReactNode }) => (
      <AuthProvider {...getOidcConfig()}>{children}</AuthProvider>
    )

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Provider>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </Provider>
  </StrictMode>
)
