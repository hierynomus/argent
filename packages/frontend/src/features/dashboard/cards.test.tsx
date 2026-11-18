import { describe, expect, test } from "bun:test"
import { renderApp, screen } from "../../../test/render"
import { CashFlowCard } from "./CashFlowCard"
import { LiabilitiesCard } from "./LiabilitiesCard"
import { NetWorthCard } from "./NetWorthCard"
import { RecentTransactionsCard } from "./RecentTransactionsCard"
import { SummaryTile } from "./SummaryTile"

describe("NetWorthCard", () => {
  const props = { netWorth: 1500, totalAssets: 2000, totalLiabilities: 500, loading: false, hasNonEurAssets: false }

  test("shows net worth, assets and liabilities", () => {
    renderApp(<NetWorthCard {...props} />)
    expect(screen.getByText("Net Worth")).toBeInTheDocument()
    expect(screen.getByText(/^[^\d]*1,500\.00$/)).toBeInTheDocument()
    expect(screen.getByText(/^[^\d]*2,000\.00$/)).toBeInTheDocument()
    expect(screen.getByText(/^[^\d]*500\.00$/)).toBeInTheDocument()
  })

  test("a negative net worth is shown in red", () => {
    renderApp(<NetWorthCard {...props} netWorth={-300} />)
    expect(screen.getByText(/300\.00/, { selector: "p" }).className).toContain("text-red-600")
  })

  test("a positive net worth is not", () => {
    renderApp(<NetWorthCard {...props} />)
    expect(screen.getByText(/1,500\.00/, { selector: "p" }).className).not.toContain("text-red-600")
  })

  test("while loading, the numbers are replaced by placeholders", () => {
    renderApp(<NetWorthCard {...props} loading />)
    expect(screen.queryByText(/1,500\.00/)).not.toBeInTheDocument()
    expect(document.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0)
  })

  test("the non-EUR note appears only when something was excluded and the numbers are ready", () => {
    const { rerender } = renderApp(<NetWorthCard {...props} hasNonEurAssets />)
    expect(screen.getByText(/Non-EUR portfolios are excluded from this total/)).toBeInTheDocument()
    rerender(<NetWorthCard {...props} hasNonEurAssets loading />)
    expect(screen.queryByText(/Non-EUR portfolios/)).not.toBeInTheDocument()
    rerender(<NetWorthCard {...props} hasNonEurAssets={false} />)
    expect(screen.queryByText(/Non-EUR portfolios/)).not.toBeInTheDocument()
  })
})

describe("SummaryTile", () => {
  test("label, value and sub-text", () => {
    renderApp(<SummaryTile label="Crypto" value="€1,000.00" sub="↑ €100.00 unrealized" />)
    expect(screen.getByText("Crypto")).toBeInTheDocument()
    expect(screen.getByText("€1,000.00")).toBeInTheDocument()
    expect(screen.getByText("↑ €100.00 unrealized")).toBeInTheDocument()
  })

  test("a missing value shows a dash", () => {
    renderApp(<SummaryTile label="Metals" />)
    expect(screen.getByText("—")).toBeInTheDocument()
  })

  test("while loading, value and sub-text are hidden behind a placeholder", () => {
    renderApp(<SummaryTile label="Stocks" value="€5.00" sub="sub" loading />)
    expect(screen.queryByText("€5.00")).not.toBeInTheDocument()
    expect(screen.queryByText("sub")).not.toBeInTheDocument()
    expect(document.querySelector(".animate-pulse")).not.toBeNull()
  })
})

describe("CashFlowCard", () => {
  test("income, expenses and a positive net (with a plus sign)", () => {
    renderApp(<CashFlowCard income={2000} expenses={500} loading={false} monthLabel="November 2026" />)
    expect(screen.getByText("Cash Flow — November 2026")).toBeInTheDocument()
    expect(screen.getByText(/^[^\d]*2,000\.00$/)).toBeInTheDocument()
    expect(screen.getByText(/^[^\d]*500\.00$/)).toBeInTheDocument()
    expect(screen.getByText(/^\+[^\d]*1,500\.00$/)).toHaveClass("text-green-600")
  })

  test("a negative net is red and not prefixed with a plus", () => {
    renderApp(<CashFlowCard income={100} expenses={400} loading={false} monthLabel="x" />)
    const net = screen.getByText(/300\.00/, { selector: "span.font-bold" })
    expect(net.className).toContain("text-red-600")
    expect(net.textContent).not.toContain("+")
  })

  test("breaking even counts as positive", () => {
    renderApp(<CashFlowCard income={100} expenses={100} loading={false} monthLabel="x" />)
    expect(screen.getByText(/\+.*0\.00/)).toHaveClass("text-green-600")
  })

  test("while loading, no figures are shown", () => {
    renderApp(<CashFlowCard income={100} expenses={400} loading monthLabel="x" />)
    expect(screen.queryByText("Income")).not.toBeInTheDocument()
  })
})

describe("LiabilitiesCard", () => {
  const props = { mortgageBalance: 200_000, mortgageMonthly: 900, mortgageCount: 1, loanBalance: 5_000, loanMonthly: 150, loanCount: 2 }

  test("says so when there are none", () => {
    renderApp(<LiabilitiesCard {...props} mortgageCount={0} loanCount={0} />)
    expect(screen.getByText("No mortgages or loans recorded.")).toBeInTheDocument()
  })

  test("shows each kind with its count, balance and monthly payment", () => {
    renderApp(<LiabilitiesCard {...props} />)
    expect(screen.getByText("Mortgages")).toBeInTheDocument()
    expect(screen.getByText("(1)")).toBeInTheDocument()
    expect(screen.getByText("(2)")).toBeInTheDocument()
    expect(screen.getAllByText(/200,000\.00/).length).toBeGreaterThan(0)
    expect(screen.getByText(/900\.00\/mo/)).toBeInTheDocument()
    expect(screen.getByText(/150\.00\/mo/)).toBeInTheDocument()
  })

  test("a total row appears only when both kinds exist", () => {
    const { rerender } = renderApp(<LiabilitiesCard {...props} />)
    expect(screen.getByText("Total")).toBeInTheDocument()
    expect(screen.getByText(/205,000\.00/)).toBeInTheDocument()
    expect(screen.getByText(/1,050\.00\/mo/)).toBeInTheDocument()
    rerender(<LiabilitiesCard {...props} loanCount={0} />)
    expect(screen.queryByText("Total")).not.toBeInTheDocument()
    expect(screen.queryByText("Loans")).not.toBeInTheDocument()
  })
})

describe("RecentTransactionsCard", () => {
  const tx = (over: object = {}) => ({ id: "t", bookingDate: "2024-06-01", amount: "12.50", currency: "EUR", creditDebitIndicator: "DBIT", counterpartyName: "Roastery", description: "beans", transferPeerId: null, ...over })

  test("lists transactions with a signed amount and a link to everything", () => {
    renderApp(<RecentTransactionsCard loading={false} transactions={[tx(), tx({ id: "u", creditDebitIndicator: "CRDT", amount: "2000.00", counterpartyName: "Employer" })]} />)
    expect(screen.getByText("Roastery")).toBeInTheDocument()
    expect(screen.getByText(/−.*12\.50/)).toBeInTheDocument()
    expect(screen.getByText(/\+.*2,000\.00/)).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /View all/ })).toHaveAttribute("href", "/overview")
  })

  test("the label falls back from counterparty to description to a dash", () => {
    renderApp(<RecentTransactionsCard loading={false} transactions={[tx({ id: "1", counterpartyName: null, description: "Only description" }), tx({ id: "2", counterpartyName: null, description: null })]} />)
    expect(screen.getByText("Only description")).toBeInTheDocument()
    expect(screen.getByText("—")).toBeInTheDocument()
  })

  test("internal transfers are not listed", () => {
    renderApp(<RecentTransactionsCard loading={false} transactions={[tx({ id: "1", counterpartyName: "Real" }), tx({ id: "2", counterpartyName: "Transfer leg", transferPeerId: "x" })]} />)
    expect(screen.getByText("Real")).toBeInTheDocument()
    expect(screen.queryByText("Transfer leg")).not.toBeInTheDocument()
  })

  test("an empty list says so", () => {
    renderApp(<RecentTransactionsCard loading={false} transactions={[]} />)
    expect(screen.getByText("No recent transactions.")).toBeInTheDocument()
  })

  test("while loading it shows placeholders instead of rows", () => {
    renderApp(<RecentTransactionsCard loading transactions={[tx()]} />)
    expect(screen.queryByText("Roastery")).not.toBeInTheDocument()
    expect(document.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0)
  })
})
