import { useAuth } from "react-oidc-context"
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom"
import Layout from "./components/Layout"
import AuthCallback from "./pages/AuthCallback"
import OverviewPage from "./pages/Overview"
import TransactionsPage from "./pages/Transactions"
import AdminPage from "./pages/Admin"
import ProfilePage from "./pages/Profile"
import CryptoPage from "./pages/Crypto"
import MetalsPage from "./pages/Metals"
import StocksPage from "./pages/Stocks"
import SavingsPage from "./pages/Savings"
import CheckingPage from "./pages/Checking"
import SubscriptionsPage from "./pages/Subscriptions"
import SettingsPage from "./pages/Settings"
import MortgagesPage from "./pages/Mortgages"
import LoansPage from "./pages/Loans"
import DashboardPage from "./pages/Dashboard"

function RequireAuth({ children }: { children: React.ReactNode }) {
  const auth = useAuth()

  if (auth.isLoading) {
    return (
      <div className="flex h-screen items-center justify-center text-gray-500">
        Loading…
      </div>
    )
  }

  if (auth.error) {
    return (
      <div className="flex h-screen items-center justify-center text-red-500">
        Auth error: {auth.error.message}
      </div>
    )
  }

  if (!auth.isAuthenticated) {
    auth.signinRedirect()
    return null
  }

  return <>{children}</>
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route
          path="/*"
          element={
            <RequireAuth>
              <Layout>
                <Routes>
                  <Route index element={<Navigate to="/dashboard" replace />} />
                  <Route path="dashboard" element={<DashboardPage />} />
                  <Route path="overview" element={<OverviewPage />} />
                  <Route path="transactions" element={<TransactionsPage />} />
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
              </Layout>
            </RequireAuth>
          }
        />
      </Routes>
    </BrowserRouter>
  )
}
