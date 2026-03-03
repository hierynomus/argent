import { useAuth } from "react-oidc-context"
import { useQuery, useQueries } from "@tanstack/react-query"
import { Link } from "react-router-dom"
import {
  getAccounts,
  getMortgages,
  getLoans,
  getCryptoPortfolios,
  getCryptoPortfolio,
  getMetalPortfolios,
  getMetalPortfolio,
  getTransactions,
} from "../api"

// ─── Formatting ──────────────────────────────────────────────────────────────

function fmtCur(n: number, currency = "EUR") {
  return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(n)
}

function fmtDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString(undefined, { day: "2-digit", month: "short" })
}

function fmtMonthLabel(d: Date) {
  return d.toLocaleDateString(undefined, { month: "long", year: "numeric" })
}

// ─── Skeleton ────────────────────────────────────────────────────────────────

function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`bg-gray-100 dark:bg-gray-800 rounded animate-pulse ${className}`} />
}

// ─── Net Worth Hero ───────────────────────────────────────────────────────────

function NetWorthCard({
  netWorth,
  totalAssets,
  totalLiabilities,
  loading,
  hasNonEurAssets,
}: {
  netWorth: number
  totalAssets: number
  totalLiabilities: number
  loading: boolean
  hasNonEurAssets: boolean
}) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 px-8 py-7">
      <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-3">
        Net Worth
      </p>
      <div className="flex flex-wrap items-end gap-6">
        <div>
          {loading ? (
            <Skeleton className="h-12 w-48" />
          ) : (
            <p className={`text-5xl font-bold tracking-tight ${netWorth >= 0 ? "text-gray-900 dark:text-gray-100" : "text-red-600 dark:text-red-400"}`}>
              {fmtCur(netWorth)}
            </p>
          )}
        </div>
        <div className="flex gap-6 pb-1 text-sm text-gray-500 dark:text-gray-400">
          <div>
            <span className="text-gray-400 dark:text-gray-500 mr-1.5">Assets</span>
            {loading ? <Skeleton className="inline-block h-4 w-24 align-middle" /> : (
              <span className="font-semibold text-gray-700 dark:text-gray-300">{fmtCur(totalAssets)}</span>
            )}
          </div>
          <div>
            <span className="text-gray-400 dark:text-gray-500 mr-1.5">Liabilities</span>
            {loading ? <Skeleton className="inline-block h-4 w-24 align-middle" /> : (
              <span className="font-semibold text-gray-700 dark:text-gray-300">{fmtCur(totalLiabilities)}</span>
            )}
          </div>
        </div>
      </div>
      {hasNonEurAssets && !loading && (
        <p className="text-xs text-amber-600 dark:text-amber-400 mt-3">
          * Non-EUR portfolios are excluded from this total.
        </p>
      )}
    </div>
  )
}

// ─── Summary Tile ─────────────────────────────────────────────────────────────

function SummaryTile({
  label,
  value,
  sub,
  loading,
}: {
  label: string
  value?: string
  sub?: string
  loading?: boolean
}) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 px-5 py-4 flex flex-col gap-1.5">
      <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
        {label}
      </p>
      {loading
        ? <Skeleton className="h-7 w-28 mt-0.5" />
        : <p className="text-xl font-bold text-gray-900 dark:text-gray-100">{value ?? "—"}</p>
      }
      {sub && !loading && (
        <p className="text-xs text-gray-400 dark:text-gray-500">{sub}</p>
      )}
    </div>
  )
}

// ─── Cash Flow Card ───────────────────────────────────────────────────────────

function CashFlowCard({
  income,
  expenses,
  loading,
  monthLabel,
}: {
  income: number
  expenses: number
  loading: boolean
  monthLabel: string
}) {
  const net = income - expenses
  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
      <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">
        Cash Flow — {monthLabel}
      </p>
      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-3/4" />
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500 dark:text-gray-400">Income</span>
            <span className="text-sm font-semibold text-green-600 dark:text-green-400 tabular-nums">
              {fmtCur(income)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500 dark:text-gray-400">Expenses</span>
            <span className="text-sm font-semibold text-red-600 dark:text-red-400 tabular-nums">
              {fmtCur(expenses)}
            </span>
          </div>
          <div className="border-t border-gray-100 dark:border-gray-800 pt-3 flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Net</span>
            <span className={`text-sm font-bold tabular-nums ${net >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
              {net >= 0 ? "+" : ""}{fmtCur(net)}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Liabilities Card ─────────────────────────────────────────────────────────

function LiabilitiesCard({
  mortgageBalance,
  mortgageMonthly,
  mortgageCount,
  loanBalance,
  loanMonthly,
  loanCount,
}: {
  mortgageBalance: number
  mortgageMonthly: number
  mortgageCount: number
  loanBalance: number
  loanMonthly: number
  loanCount: number
}) {
  const totalBalance = mortgageBalance + loanBalance
  const totalMonthly = mortgageMonthly + loanMonthly
  const hasAny = mortgageCount > 0 || loanCount > 0

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
      <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">Liabilities</p>
      {!hasAny ? (
        <p className="text-sm text-gray-400 dark:text-gray-500">No mortgages or loans recorded.</p>
      ) : (
        <div className="space-y-3">
          {mortgageCount > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500 dark:text-gray-400">
                Mortgages
                <span className="ml-1.5 text-xs text-gray-400 dark:text-gray-500">({mortgageCount})</span>
              </span>
              <div className="text-right tabular-nums">
                <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">{fmtCur(mortgageBalance)}</span>
                <span className="text-xs text-gray-400 dark:text-gray-500 ml-1.5">{fmtCur(mortgageMonthly)}/mo</span>
              </div>
            </div>
          )}
          {loanCount > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500 dark:text-gray-400">
                Loans
                <span className="ml-1.5 text-xs text-gray-400 dark:text-gray-500">({loanCount})</span>
              </span>
              <div className="text-right tabular-nums">
                <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">{fmtCur(loanBalance)}</span>
                <span className="text-xs text-gray-400 dark:text-gray-500 ml-1.5">{fmtCur(loanMonthly)}/mo</span>
              </div>
            </div>
          )}
          {mortgageCount > 0 && loanCount > 0 && (
            <div className="border-t border-gray-100 dark:border-gray-800 pt-3 flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Total</span>
              <div className="text-right tabular-nums">
                <span className="text-sm font-bold text-gray-900 dark:text-gray-100">{fmtCur(totalBalance)}</span>
                <span className="text-xs text-gray-400 dark:text-gray-500 ml-1.5">{fmtCur(totalMonthly)}/mo</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Recent Transactions Card ─────────────────────────────────────────────────

function RecentTransactionsCard({
  transactions,
  loading,
}: {
  transactions: Array<{
    id: string
    bookingDate: string
    amount: string
    currency: string
    creditDebitIndicator: string
    counterpartyName: string | null
    description: string | null
    transferPeerId: string | null
  }>
  loading: boolean
}) {
  // Exclude internal transfers
  const visible = transactions.filter(t => !t.transferPeerId)

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">Recent Transactions</p>
        <Link
          to="/overview"
          className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-medium"
        >
          View all →
        </Link>
      </div>
      {loading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="flex items-center justify-between gap-3">
              <Skeleton className="h-4 w-12" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-4 w-20" />
            </div>
          ))}
        </div>
      ) : visible.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-gray-500">No recent transactions.</p>
      ) : (
        <div className="divide-y divide-gray-50 dark:divide-gray-800/50">
          {visible.map((tx) => {
            const isCredit = tx.creditDebitIndicator === "CRDT"
            const label = tx.counterpartyName ?? tx.description ?? "—"
            return (
              <div key={tx.id} className="flex items-center gap-4 py-2.5">
                <span className="text-xs text-gray-400 dark:text-gray-500 w-12 shrink-0 tabular-nums">
                  {fmtDate(tx.bookingDate)}
                </span>
                <span className="text-sm text-gray-700 dark:text-gray-300 flex-1 truncate">
                  {label}
                </span>
                <span className={`text-sm font-semibold tabular-nums shrink-0 ${isCredit ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                  {isCredit ? "+" : "−"}{fmtCur(parseFloat(tx.amount), tx.currency)}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Dashboard Page ───────────────────────────────────────────────────────────

export default function DashboardPage() {
  const auth = useAuth()
  const token = auth.user?.access_token ?? ""

  const now = new Date()
  const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
  const monthStart = `${yearMonth}-01`
  const today = now.toISOString().slice(0, 10)

  // ── Core queries ──
  const { data: accounts = [] } = useQuery({
    queryKey: ["accounts"],
    queryFn: () => getAccounts(token),
    enabled: !!token,
  })
  const { data: mortgages = [] } = useQuery({
    queryKey: ["mortgages"],
    queryFn: () => getMortgages(token),
    enabled: !!token,
  })
  const { data: loans = [] } = useQuery({
    queryKey: ["loans"],
    queryFn: () => getLoans(token),
    enabled: !!token,
  })
  const { data: cryptoList = [] } = useQuery({
    queryKey: ["crypto-portfolios-list"],
    queryFn: () => getCryptoPortfolios(token),
    enabled: !!token,
  })
  const { data: metalList = [] } = useQuery({
    queryKey: ["metal-portfolios-list"],
    queryFn: () => getMetalPortfolios(token),
    enabled: !!token,
  })

  // ── Per-portfolio details (parallel) ──
  const cryptoDetails = useQueries({
    queries: cryptoList.map((p) => ({
      queryKey: ["crypto", p.id],
      queryFn: () => getCryptoPortfolio(token, p.id),
      enabled: !!token,
    })),
  })
  const metalDetails = useQueries({
    queries: metalList.map((p) => ({
      queryKey: ["metals", p.id],
      queryFn: () => getMetalPortfolio(token, p.id),
      enabled: !!token,
    })),
  })

  // ── Monthly transactions ──
  const { data: monthlyData, isLoading: monthlyLoading } = useQuery({
    queryKey: ["transactions-monthly", yearMonth],
    queryFn: () => getTransactions(token, { from: monthStart, to: today, pageSize: 500 }),
    enabled: !!token,
  })

  // ── Recent transactions ──
  const { data: recentData, isLoading: recentLoading } = useQuery({
    queryKey: ["transactions-recent"],
    queryFn: () => getTransactions(token, { pageSize: 5 }),
    enabled: !!token,
  })

  // ── Net worth computation ──
  const totalAccountsBalance = accounts.reduce((s, a) => s + parseFloat(a.balance), 0)

  const cryptoLoading = cryptoDetails.some((d) => d.isLoading)
  const totalCryptoEur = cryptoDetails.reduce((s, d) => s + (d.data?.totalCurrentValueEur ?? 0), 0)
  const totalCryptoUnrealizedPnL = cryptoDetails.reduce((s, d) => s + (d.data?.totalUnrealizedPnL ?? 0), 0)

  const metalLoading = metalDetails.some((d) => d.isLoading)
  // Only EUR metal portfolios count towards EUR net worth
  const hasNonEurMetals = metalList.some((p) => p.currency !== "EUR")
  const totalMetalsEur = metalDetails.reduce((s, d, i) => {
    if (metalList[i]?.currency !== "EUR") return s
    return s + (d.data?.totalCurrentValueOpen ?? 0)
  }, 0)
  const totalMetalsUnrealizedPnL = metalDetails.reduce((s, d, i) => {
    if (metalList[i]?.currency !== "EUR") return s
    return s + (d.data?.totalUnrealizedPnL ?? 0)
  }, 0)

  const totalMortgageBalance = mortgages.reduce((s, m) => s + m.totalCurrentBalance, 0)
  const totalMortgageMonthly = mortgages.reduce((s, m) => s + m.totalMonthlyPayment, 0)
  const totalLoanBalance = loans.reduce((s, l) => s + l.totalCurrentBalance, 0)
  const totalLoanMonthly = loans.reduce((s, l) => s + l.totalMonthlyPayment, 0)

  const totalAssets = totalAccountsBalance + totalCryptoEur + totalMetalsEur
  const totalLiabilities = totalMortgageBalance + totalLoanBalance
  const netWorth = totalAssets - totalLiabilities
  const netWorthLoading = cryptoLoading || metalLoading

  // ── Monthly cash flow ──
  const eligible = (monthlyData?.data ?? []).filter((t) => !t.transferPeerId)
  const monthlyIncome = eligible
    .filter((t) => t.creditDebitIndicator === "CRDT")
    .reduce((s, t) => s + parseFloat(t.amount), 0)
  const monthlyExpenses = eligible
    .filter((t) => t.creditDebitIndicator === "DBIT")
    .reduce((s, t) => s + parseFloat(t.amount), 0)
  const monthlyNet = monthlyIncome - monthlyExpenses

  // ── Summary tile sub-text helpers ──
  const savingsCount = accounts.filter((a) => a.type === "savings").length
  const checkingCount = accounts.filter((a) => a.type === "checking").length
  const bankingSub = [
    savingsCount > 0 ? `${savingsCount} savings` : "",
    checkingCount > 0 ? `${checkingCount} checking` : "",
  ].filter(Boolean).join(" · ") || undefined

  const cryptoSub = !cryptoLoading && cryptoList.length > 0
    ? totalCryptoUnrealizedPnL !== 0
      ? `${totalCryptoUnrealizedPnL >= 0 ? "↑" : "↓"} ${fmtCur(Math.abs(totalCryptoUnrealizedPnL))} unrealized`
      : undefined
    : undefined

  const metalsSub = !metalLoading && metalList.length > 0
    ? totalMetalsUnrealizedPnL !== 0
      ? `${totalMetalsUnrealizedPnL >= 0 ? "↑" : "↓"} ${fmtCur(Math.abs(totalMetalsUnrealizedPnL))} unrealized`
      : undefined
    : undefined

  const monthlySub = !monthlyLoading
    ? `↑ ${fmtCur(monthlyIncome)} income · ↓ ${fmtCur(monthlyExpenses)} expenses`
    : undefined

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Dashboard</h1>

      {/* Net worth hero */}
      <NetWorthCard
        netWorth={netWorth}
        totalAssets={totalAssets}
        totalLiabilities={totalLiabilities}
        loading={netWorthLoading}
        hasNonEurAssets={hasNonEurMetals}
      />

      {/* Summary tiles row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryTile
          label="Banking"
          value={fmtCur(totalAccountsBalance)}
          sub={bankingSub}
        />
        <SummaryTile
          label="Crypto"
          value={cryptoList.length === 0 ? "—" : fmtCur(totalCryptoEur)}
          sub={cryptoSub}
          loading={cryptoLoading && cryptoList.length > 0}
        />
        <SummaryTile
          label="Metals"
          value={metalList.length === 0 ? "—" : fmtCur(totalMetalsEur)}
          sub={metalsSub}
          loading={metalLoading && metalList.length > 0}
        />
        <SummaryTile
          label="This month"
          value={`${monthlyNet >= 0 ? "+" : ""}${fmtCur(monthlyNet)}`}
          sub={monthlySub}
          loading={monthlyLoading}
        />
      </div>

      {/* Cash flow + Liabilities */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <CashFlowCard
          income={monthlyIncome}
          expenses={monthlyExpenses}
          loading={monthlyLoading}
          monthLabel={fmtMonthLabel(now)}
        />
        <LiabilitiesCard
          mortgageBalance={totalMortgageBalance}
          mortgageMonthly={totalMortgageMonthly}
          mortgageCount={mortgages.length}
          loanBalance={totalLoanBalance}
          loanMonthly={totalLoanMonthly}
          loanCount={loans.length}
        />
      </div>

      {/* Recent transactions */}
      <RecentTransactionsCard
        transactions={recentData?.data ?? []}
        loading={recentLoading}
      />
    </div>
  )
}
