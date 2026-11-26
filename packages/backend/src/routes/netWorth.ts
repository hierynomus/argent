import { Hono } from "hono"
import { and, eq, inArray, sql } from "drizzle-orm"
import { db } from "../db"
import {
  accounts, cryptoTrades, loanExtraPayments, loanPartRates, loanParts, loans, metalLots, metalSales, mortgageExtraPayments, mortgagePartRates, mortgageParts, mortgages,
  pensionPlans, pensionStatements, portfolioCashMovements, portfolios, properties, propertyValuations, stockDividends, stockTrades, transactions,
} from "../db/schema"
import {
  getViewableAccountIds, getViewableLoanIds, getViewableMortgageIds, getViewablePensionPlanIds, getViewablePortfolioIds, getViewablePropertyIds, toAccessContext,
} from "../services/accessControl"
import { balanceSchedule, sumSchedules } from "../services/amortization"
import { netWorthHistory, type NetWorthData } from "../services/netWorthHistory"
import { groupBy } from "../lib/groupBy"
import { todayIso } from "../lib/dates"
import type { AuthUser } from "../middleware/auth"

const app = new Hono<{ Variables: { user: AuthUser } }>()
const EUR = "EUR"
const none = <T,>(ids: string[], load: () => Promise<T[]>) => (ids.length === 0 ? Promise.resolve([] as T[]) : load())

/** Balance of one mortgage/loan kind over time, per debt, from its parts, extra payments and rate changes. */
async function debtSchedules(
  ids: string[],
  t: { parts: typeof mortgageParts | typeof loanParts; payments: typeof mortgageExtraPayments | typeof loanExtraPayments; rates: typeof mortgagePartRates | typeof loanPartRates },
  fk: "mortgageId" | "loanId",
  currencyOf: Map<string, string>,
) {
  if (ids.length === 0) return []
  const parts = await db.select().from(t.parts as typeof mortgageParts).where(inArray((t.parts as any)[fk], ids))
  if (parts.length === 0) return []
  const partIds = parts.map((p) => p.id)
  const [payments, rates] = await Promise.all([
    db.select().from(t.payments as typeof mortgageExtraPayments).where(inArray((t.payments as typeof mortgageExtraPayments).partId, partIds)),
    db.select().from(t.rates as typeof mortgagePartRates).where(inArray((t.rates as typeof mortgagePartRates).partId, partIds)),
  ])
  const byDebt = groupBy(parts, (p) => (p as any)[fk] as string)
  const out: Array<Array<{ date: string; balance: number }>> = []
  for (const [debtId, debtParts] of byDebt) {
    if (currencyOf.get(debtId) !== EUR) continue
    out.push(sumSchedules(debtParts.map((p) => balanceSchedule(p, payments.filter((x) => x.partId === p.id), rates.filter((r) => r.partId === p.id)).actual)))
  }
  return out
}

/**
 * Net worth over time in EUR, computed from the dated facts on every request (nothing is stored): bank balances,
 * debts, property valuations, pension statements, and investments at what they cost (there is no price history).
 */
app.get("/history", async (c) => {
  const ctx = toAccessContext(c.get("user"))
  const [accountIds, cryptoIds, stockIds, metalIds, mortgageIds, loanIds, propertyIds, pensionIds] = await Promise.all([
    getViewableAccountIds(ctx),
    getViewablePortfolioIds(ctx, "crypto"),
    getViewablePortfolioIds(ctx, "stocks"),
    getViewablePortfolioIds(ctx, "metals"),
    getViewableMortgageIds(ctx),
    getViewableLoanIds(ctx),
    getViewablePropertyIds(ctx),
    getViewablePensionPlanIds(ctx),
  ])
  const tradingIds = [...cryptoIds, ...stockIds]

  const [accountRows, dailyRows, tradingRows, metalRows, propertyRows, pensionRows] = await Promise.all([
    none(accountIds, () => db.select().from(accounts).where(and(inArray(accounts.id, accountIds), eq(accounts.currency, EUR)))),
    none(accountIds, () =>
      db
        .select({
          accountId: transactions.accountId,
          date: transactions.bookingDate,
          net: sql<string>`SUM(CASE WHEN ${transactions.creditDebitIndicator} = 'CRDT' THEN ${transactions.amount}::numeric ELSE -${transactions.amount}::numeric END)`,
        })
        .from(transactions)
        .where(inArray(transactions.accountId, accountIds))
        .groupBy(transactions.accountId, transactions.bookingDate),
    ),
    none(tradingIds, () => db.select().from(portfolios).where(and(inArray(portfolios.id, tradingIds), eq(portfolios.currency, EUR)))),
    none(metalIds, () => db.select().from(portfolios).where(and(inArray(portfolios.id, metalIds), eq(portfolios.currency, EUR)))),
    none(propertyIds, () => db.select().from(properties).where(and(inArray(properties.id, propertyIds), eq(properties.currency, EUR)))),
    none(pensionIds, () => db.select().from(pensionPlans).where(and(inArray(pensionPlans.id, pensionIds), eq(pensionPlans.currency, EUR)))),
  ])

  const tradingPortfolioIds = tradingRows.map((p) => p.id)
  const metalPortfolioIds = metalRows.map((p) => p.id)
  const [crypto, stock, movements, dividends, lots, sales, valuations, statements, mortgageRows, loanRows] = await Promise.all([
    none(tradingPortfolioIds, () => db.select().from(cryptoTrades).where(inArray(cryptoTrades.portfolioId, tradingPortfolioIds))),
    none(tradingPortfolioIds, () => db.select().from(stockTrades).where(inArray(stockTrades.portfolioId, tradingPortfolioIds))),
    none(tradingPortfolioIds, () => db.select().from(portfolioCashMovements).where(inArray(portfolioCashMovements.portfolioId, tradingPortfolioIds))),
    none(tradingPortfolioIds, () => db.select().from(stockDividends).where(inArray(stockDividends.portfolioId, tradingPortfolioIds))),
    none(metalPortfolioIds, () => db.select().from(metalLots).where(inArray(metalLots.portfolioId, metalPortfolioIds))),
    none(metalPortfolioIds, () => db.select().from(metalSales).where(inArray(metalSales.portfolioId, metalPortfolioIds))),
    none(propertyRows.map((p) => p.id), () => db.select().from(propertyValuations).where(inArray(propertyValuations.propertyId, propertyRows.map((p) => p.id)))),
    none(pensionRows.map((p) => p.id), () => db.select().from(pensionStatements).where(inArray(pensionStatements.planId, pensionRows.map((p) => p.id)))),
    none(mortgageIds, () => db.select().from(mortgages).where(inArray(mortgages.id, mortgageIds))),
    none(loanIds, () => db.select().from(loans).where(inArray(loans.id, loanIds))),
  ])

  const [mortgageSchedules, loanSchedules] = await Promise.all([
    debtSchedules(mortgageIds, { parts: mortgageParts, payments: mortgageExtraPayments, rates: mortgagePartRates }, "mortgageId", new Map(mortgageRows.map((d) => [d.id, d.currency]))),
    debtSchedules(loanIds, { parts: loanParts, payments: loanExtraPayments, rates: loanPartRates }, "loanId", new Map(loanRows.map((d) => [d.id, d.currency]))),
  ])

  const tradesOf = groupBy([...crypto, ...stock], (t) => t.portfolioId)
  const dailyOf = groupBy(dailyRows, (r) => r.accountId)
  const data: NetWorthData = {
    accounts: accountRows.map((a) => ({
      openingBalance: a.openingBalance ?? "0",
      openingBalanceDate: a.openingBalanceDate,
      txs: (dailyOf.get(a.id) ?? []).map((r) => ({ date: String(r.date), net: String(r.net) })),
    })),
    trading: tradingRows.map((p) => ({
      currency: p.currency,
      openingCash: p.openingCash,
      openingCashDate: p.openingCashDate,
      trades: tradesOf.get(p.id) ?? [],
      movements: movements.filter((m) => m.portfolioId === p.id),
      dividends: dividends.filter((d) => d.portfolioId === p.id),
    })),
    metals: metalRows.map((p) => ({
      lots: lots.filter((l) => l.portfolioId === p.id).map((l) => ({ id: l.id, purchaseDate: l.purchaseDate, quantity: l.quantity, pricePerPiece: l.pricePerPiece })),
      sales: sales.filter((s) => s.portfolioId === p.id),
    })),
    properties: propertyRows.map((p) => ({ valuations: valuations.filter((v) => v.propertyId === p.id), purchase: { price: p.purchasePrice, date: p.purchaseDate } })),
    pensions: pensionRows.map((p) => ({ countInNetWorth: p.countInNetWorth, status: p.status, closedOn: p.closedOn, statements: statements.filter((s) => s.planId === p.id) })),
    debts: [...mortgageSchedules, ...loanSchedules],
  }

  return c.json({ currency: EUR, points: netWorthHistory(data, todayIso()) })
})

export default app
