import { lazy, Suspense, type ReactNode } from "react"
import { useAuth } from "react-oidc-context"
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom"
import { LoadingText } from "./components/ui"
import Layout from "./components/Layout"
import AuthCallback from "./pages/AuthCallback"

// Each page is its own chunk, loaded when first visited, so the initial download stays small.
const DashboardPage = lazy(() => import("./pages/Dashboard"))
const OverviewPage = lazy(() => import("./pages/Overview"))
const AdminPage = lazy(() => import("./pages/Admin"))
const ProfilePage = lazy(() => import("./pages/Profile"))
const CryptoPage = lazy(() => import("./pages/Crypto"))
const MetalsPage = lazy(() => import("./pages/Metals"))
const StocksPage = lazy(() => import("./pages/Stocks"))
const SavingsPage = lazy(() => import("./pages/Savings"))
const CheckingPage = lazy(() => import("./pages/Checking"))
const SubscriptionsPage = lazy(() => import("./pages/Subscriptions"))
const SettingsPage = lazy(() => import("./pages/Settings"))
const MortgagesPage = lazy(() => import("./pages/Mortgages"))
const LoansPage = lazy(() => import("./pages/Loans"))

function RequireAuth({ children }: { children: ReactNode }) {
  const auth = useAuth()

  if (auth.isLoading) {
    return <div className="flex h-screen items-center justify-center text-gray-500">Loading…</div>
  }

  if (auth.error) {
    return <div className="flex h-screen items-center justify-center text-red-500">Auth error: {auth.error.message}</div>
  }

  if (!auth.isAuthenticated) {
    auth.signinRedirect()
    return null
  }

  return <>{children}</>
}

/** All routes (without the router itself, so tests can mount them in a MemoryRouter). */
export function AppRoutes() {
  return (
    <Routes>
      <Route path="/auth/callback" element={<AuthCallback />} />
      <Route
        path="/*"
        element={
          <RequireAuth>
            <Layout>
              <Suspense fallback={<LoadingText />}>
                <Routes>
                  <Route index element={<Navigate to="/dashboard" replace />} />
                  <Route path="dashboard" element={<DashboardPage />} />
                  <Route path="overview" element={<OverviewPage />} />
                  {/* the old, simpler transactions list was folded into the overview */}
                  <Route path="transactions" element={<Navigate to="/overview" replace />} />
                  <Route path="admin" element={<AdminPage />} />
                  <Route path="profile" element={<ProfilePage />} />
                  <Route path="checking" element={<CheckingPage />} />
                  <Route path="savings" element={<SavingsPage />} />
                  <Route path="subscriptions" element={<SubscriptionsPage />} />
                  <Route path="settings" element={<SettingsPage />} />
                  <Route path="mortgages" element={<MortgagesPage />} />
                  <Route path="loans" element={<LoansPage />} />
                  <Route path="crypto" element={<CryptoPage />} />
                  <Route path="metals" element={<MetalsPage />} />
                  <Route path="stocks" element={<StocksPage />} />
                </Routes>
              </Suspense>
            </Layout>
          </RequireAuth>
        }
      />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  )
}
