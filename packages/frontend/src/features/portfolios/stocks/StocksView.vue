<script setup lang="ts">
import { computed, ref } from "vue"
import type { StockPortfolioDetail } from "@argent/shared"
import { Button } from "../../../components/ui"
import { fmtMaxDecimals, fmtSymbolCur } from "../../../lib/format"
import AssetChart from "../AssetChart.vue"
import PositionsTable from "../PositionsTable.vue"
import SummaryTiles from "../SummaryTiles.vue"
import { standardTiles } from "../tiles"
import TradeHistory from "../TradeHistory.vue"
import CashPanel from "../cash/CashPanel.vue"
import DividendForm from "./DividendForm.vue"
import DividendHistory from "./DividendHistory.vue"
import StockTradeForm from "./StockTradeForm.vue"

/** What is inside a stock/ETF portfolio: totals, positions, trade + dividend forms and their histories. */
const props = defineProps<{ portfolio: StockPortfolioDetail }>()

// clicking a symbol opens its price chart under the table
const selected = ref<string | null>(null)
const selectedPosition = computed(() => props.portfolio.positions.find((p) => p.symbol === selected.value))
const mode = ref<"idle" | "trade" | "dividend">("idle")
const close = () => (mode.value = "idle")
const fmt4 = (n: number) => fmtMaxDecimals(n, 4)

const tiles = computed(() => [
  ...standardTiles(
    { openCost: props.portfolio.totalOpenCost, currentValue: props.portfolio.totalCurrentValue, unrealized: props.portfolio.totalUnrealizedPnL, realized: props.portfolio.totalRealizedPnL, cash: props.portfolio.cash },
    props.portfolio.currency,
  ),
  { label: "Dividends", value: fmtSymbolCur(props.portfolio.totalDividends, props.portfolio.currency), color: props.portfolio.totalDividends > 0 ? "text-green-600 dark:text-green-400" : undefined },
])
</script>

<template>
  <SummaryTiles :tiles="tiles" />
  <PositionsTable :positions="portfolio.positions" :currency="portfolio.currency" balance-header="Shares" :format-balance="fmt4" show-dividends min-width="min-w-[780px]" :selected-symbol="selected" @select="(s) => (selected = selected === s ? null : s)" />
  <AssetChart v-if="selectedPosition" :key="selectedPosition.symbol" kind="stocks" :symbol="selectedPosition.symbol" :name="selectedPosition.name" :currency="portfolio.currency as 'EUR' | 'USD'" :trades="portfolio.trades" @close="selected = null" />

  <CashPanel kind="stocks" :portfolio="portfolio" />

  <div v-if="portfolio.canEdit && mode === 'idle'" class="flex gap-4 mb-4">
    <Button variant="link" class="font-normal" @click="mode = 'trade'">+ Record trade</Button>
    <Button variant="link" class="font-normal" @click="mode = 'dividend'">+ Record dividend</Button>
  </div>
  <StockTradeForm v-if="portfolio.canEdit && mode === 'trade'" :portfolio="portfolio" @done="close" />
  <DividendForm v-if="portfolio.canEdit && mode === 'dividend'" :portfolio="portfolio" @done="close" />

  <TradeHistory class="mb-4" :trades="portfolio.trades" :currency="portfolio.currency" :format-amount="fmt4" />
  <DividendHistory :dividends="portfolio.dividends" :currency="portfolio.currency" :can-edit="portfolio.canEdit" />
</template>
