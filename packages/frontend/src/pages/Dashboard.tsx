import { useAccounts, useDebts, usePortfolioDetails, usePortfolios, useRecentTransactions, useTransactionsBetween } from "../api"
import { fmtCur, fmtMonthLabel } from "../lib/format"
import { NetWorthCard } from "../features/dashboard/NetWorthCard"
import { SummaryTile } from "../features/dashboard/SummaryTile"
import { CashFlowCard } from "../features/dashboard/CashFlowCard"
import { LiabilitiesCard } from "../features/dashboard/LiabilitiesCard"
import { RecentTransactionsCard } from "../features/dashboard/RecentTransactionsCard"
import { bankingLabel, summarize, toHoldings, unrealizedLabel } from "../features/dashboard/summarize"

// ─── Dashboard Page ───────────────────────────────────────────────────────────

export default function DashboardPage() {
  const now = new Date()
  const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
  const monthStart = `${yearMonth}-01`
  const today = now.toISOString().slice(0, 10)

  // ── Core queries ──
  const { data: accounts = [] } = useAccounts()
  const { data: mortgages = [] } = useDebts("mortgages")
  const { data: loans = [] } = useDebts("loans")
  const { data: cryptoList = [] } = usePortfolios("crypto")
  const { data: metalList = [] } = usePortfolios("metals")
  const { data: stockList = [] } = usePortfolios("stocks")

  // ── Per-portfolio details (parallel) ──
  const cryptoDetails = usePortfolioDetails("crypto", cryptoList)
  const metalDetails = usePortfolioDetails("metals", metalList)
  const stockDetails = usePortfolioDetails("stocks", stockList)

  // ── Monthly transactions ──
  const { data: monthlyData, isLoading: monthlyLoading } = useTransactionsBetween(yearMonth, monthStart, today)

  // ── Recent transactions ──
  const { data: recentData, isLoading: recentLoading } = useRecentTransactions(5)

  const summary = summarize({
    accounts,
    mortgages,
    loans,
    crypto: toHoldings(cryptoList, cryptoDetails, (d) => d.totalCurrentValueEur),
    metals: toHoldings(metalList, metalDetails, (d) => d.totalCurrentValueOpen),
    stocks: toHoldings(stockList, stockDetails, (d) => d.totalCurrentValueEur),
    monthTransactions: monthlyData?.data ?? [],
  })
  const { cashFlow } = summary

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Dashboard</h1>

      {/* Net worth hero */}
      <NetWorthCard
        netWorth={summary.netWorth}
        totalAssets={summary.totalAssets}
        totalLiabilities={summary.totalLiabilities}
        loading={summary.netWorthLoading}
        hasNonEurAssets={summary.hasExcludedNonEur}
      />

      {/* Summary tiles row */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <SummaryTile
          label="Banking"
          value={fmtCur(summary.accountsTotal)}
          sub={bankingLabel(accounts)}
        />
        <SummaryTile
          label="Crypto"
          value={cryptoList.length === 0 ? "—" : fmtCur(summary.crypto.total)}
          sub={unrealizedLabel(summary.crypto, fmtCur)}
          loading={summary.crypto.loading && cryptoList.length > 0}
        />
        <SummaryTile
          label="Metals"
          value={metalList.length === 0 ? "—" : fmtCur(summary.metals.total)}
          sub={unrealizedLabel(summary.metals, fmtCur)}
          loading={summary.metals.loading && metalList.length > 0}
        />
        <SummaryTile
          label="Stocks"
          value={stockList.length === 0 ? "—" : fmtCur(summary.stocks.total)}
          sub={unrealizedLabel(summary.stocks, fmtCur)}
          loading={summary.stocks.loading && stockList.length > 0}
        />
        <SummaryTile
          label="This month"
          value={`${cashFlow.net >= 0 ? "+" : ""}${fmtCur(cashFlow.net)}`}
          sub={monthlyLoading ? undefined : `↑ ${fmtCur(cashFlow.income)} income · ↓ ${fmtCur(cashFlow.expenses)} expenses`}
          loading={monthlyLoading}
        />
      </div>

      {/* Cash flow + Liabilities */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <CashFlowCard
          income={cashFlow.income}
          expenses={cashFlow.expenses}
          loading={monthlyLoading}
          monthLabel={fmtMonthLabel(now)}
        />
        <LiabilitiesCard
          mortgageBalance={summary.mortgages.balance}
          mortgageMonthly={summary.mortgages.monthly}
          mortgageCount={summary.mortgages.count}
          loanBalance={summary.loans.balance}
          loanMonthly={summary.loans.monthly}
          loanCount={summary.loans.count}
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
