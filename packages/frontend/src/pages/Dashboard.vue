<script setup lang="ts">
import { computed } from "vue"
import { useAccounts, useDebts, usePortfolioDetails, usePortfolios, useEquityPlans, usePensionPlans, useProperties, useTransactionsBetween } from "../api"
import { fmtCur, fmtMonthLabel, pnlColor } from "../lib/format"
import CashFlowCard from "../features/dashboard/CashFlowCard.vue"
import LiabilitiesCard from "../features/dashboard/LiabilitiesCard.vue"
import NetWorthCard from "../features/dashboard/NetWorthCard.vue"
import SummaryTile from "../features/dashboard/SummaryTile.vue"
import { assetMix, bankingLabel, summarize, toHoldings, unrealizedLabel } from "../features/dashboard/summarize"

const now = new Date()
const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
const monthStart = `${yearMonth}-01`
const today = now.toISOString().slice(0, 10)
const monthLabel = fmtMonthLabel(now)

const { data: accountsData } = useAccounts()
const { data: mortgagesData } = useDebts("mortgages")
const { data: loansData } = useDebts("loans")
const { data: cryptoData } = usePortfolios("crypto")
const { data: metalData } = usePortfolios("metals")
const { data: stockData } = usePortfolios("stocks")
const { data: propertyData, isLoading: propertiesLoading } = useProperties()
const { data: equityData, isLoading: equityLoading } = useEquityPlans()
const { data: pensionData, isLoading: pensionsLoading } = usePensionPlans()
const accounts = computed(() => accountsData.value ?? [])
const cryptoList = computed(() => cryptoData.value ?? [])
const metalList = computed(() => metalData.value ?? [])
const stockList = computed(() => stockData.value ?? [])

// per-portfolio details load in parallel
const cryptoDetails = usePortfolioDetails("crypto", cryptoList)
const metalDetails = usePortfolioDetails("metals", metalList)
const stockDetails = usePortfolioDetails("stocks", stockList)

const { data: monthlyData, isLoading: monthlyLoading } = useTransactionsBetween(yearMonth, monthStart, today)

const summary = computed(() =>
  summarize({
    accounts: accounts.value,
    mortgages: mortgagesData.value ?? [],
    loans: loansData.value ?? [],
    crypto: toHoldings(cryptoList.value, cryptoDetails.value, (d) => d.totalCurrentValue),
    metals: toHoldings(metalList.value, metalDetails.value, (d) => d.totalCurrentValueOpen),
    stocks: toHoldings(stockList.value, stockDetails.value, (d) => d.totalCurrentValue),
    monthTransactions: monthlyData.value?.data ?? [],
    properties: propertyData.value ?? [],
    propertiesLoading: propertiesLoading.value,
    equity: equityData.value ?? [],
    equityLoading: equityLoading.value,
    pensions: pensionData.value ?? [],
    pensionsLoading: pensionsLoading.value,
  }),
)
const cashFlow = computed(() => summary.value.cashFlow)
const mix = computed(() => assetMix(summary.value))

const tile = (list: unknown[], s: { total: number }) => (list.length === 0 ? "—" : fmtCur(s.total))
</script>

<template>
  <div class="space-y-6">
    <h1 class="text-2xl font-bold text-gray-900 dark:text-gray-100">Dashboard</h1>

    <!-- the overview: net worth and how this month is going -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <NetWorthCard class="lg:col-span-2" :net-worth="summary.netWorth" :total-assets="summary.totalAssets" :total-liabilities="summary.totalLiabilities" :loading="summary.netWorthLoading" :has-non-eur-assets="summary.hasExcludedNonEur" :mix="mix" />
      <SummaryTile
        label="This month"
        :value="`${cashFlow.net >= 0 ? '+' : ''}${fmtCur(cashFlow.net)}`"
        :value-color="pnlColor(cashFlow.net)"
        :loading="monthlyLoading"
        class="justify-center"
      >
        <template #sub>
          <span :class="pnlColor(1)">↑ {{ fmtCur(cashFlow.income) }}</span> income ·
          <span :class="pnlColor(-1)">↓ {{ fmtCur(cashFlow.expenses) }}</span> expenses
        </template>
      </SummaryTile>
    </div>

    <!-- as many as fit at 15rem or wider, so larger amounts keep their room -->
    <div class="grid grid-cols-[repeat(auto-fit,minmax(15rem,1fr))] gap-4">
      <SummaryTile label="Banking" :value="fmtCur(summary.accountsTotal)" :sub="bankingLabel(accounts)" />
      <SummaryTile label="Crypto" :value="tile(cryptoList, summary.crypto)" :sub="unrealizedLabel(summary.crypto, fmtCur)" :sub-color="pnlColor(summary.crypto.unrealizedPnL)" :loading="summary.crypto.loading && cryptoList.length > 0" />
      <SummaryTile label="Metals" :value="tile(metalList, summary.metals)" :sub="unrealizedLabel(summary.metals, fmtCur)" :sub-color="pnlColor(summary.metals.unrealizedPnL)" :loading="summary.metals.loading && metalList.length > 0" />
      <SummaryTile label="Stocks" :value="tile(stockList, summary.stocks)" :sub="unrealizedLabel(summary.stocks, fmtCur)" :sub-color="pnlColor(summary.stocks.unrealizedPnL)" :loading="summary.stocks.loading && stockList.length > 0" />
      <SummaryTile
        label="Property"
        :value="summary.properties.count === 0 ? '—' : fmtCur(summary.properties.value)"
        :sub="summary.properties.count === 0 ? undefined : `Equity ${fmtCur(summary.properties.equity)}`"
        :loading="summary.properties.loading"
      />
      <SummaryTile
        label="Options"
        :value="summary.equity.count === 0 ? '—' : fmtCur(summary.equity.vestedValue)"
        :sub="summary.equity.count === 0 ? undefined : `Vested · ${fmtCur(summary.equity.onExitValue)} on exit`"
        :loading="summary.equity.loading"
      />
      <SummaryTile
        label="Pensions"
        :value="summary.pensions.count === 0 ? '—' : fmtCur(summary.pensions.value)"
        :sub="summary.pensions.count === 0 ? undefined : 'Pots that count in net worth'"
        :loading="summary.pensions.loading"
      />
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <CashFlowCard :income="cashFlow.income" :expenses="cashFlow.expenses" :loading="monthlyLoading" :month-label="monthLabel" />
      <LiabilitiesCard
        :mortgage-balance="summary.mortgages.balance"
        :mortgage-monthly="summary.mortgages.monthly"
        :mortgage-count="summary.mortgages.count"
        :loan-balance="summary.loans.balance"
        :loan-monthly="summary.loans.monthly"
        :loan-count="summary.loans.count"
      />
    </div>
  </div>
</template>
