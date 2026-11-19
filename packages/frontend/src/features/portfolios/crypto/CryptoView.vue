<script setup lang="ts">
import { computed, ref } from "vue"
import type { PortfolioDetail } from "@argent/shared"
import { Button } from "../../../components/ui"
import { fmtSignificant } from "../../../lib/format"
import AssetChart from "../AssetChart.vue"
import PositionsTable from "../PositionsTable.vue"
import SummaryTiles from "../SummaryTiles.vue"
import { standardTiles } from "../tiles"
import TradeHistory from "../TradeHistory.vue"
import CashPanel from "../cash/CashPanel.vue"
import CryptoTradeForm from "./CryptoTradeForm.vue"

/** What is inside a crypto portfolio: totals, positions, the trade form and the ledger. */
const props = defineProps<{ portfolio: PortfolioDetail }>()
const adding = ref(false)
// clicking a symbol opens its price chart under the table
const selected = ref<string | null>(null)
const selectedPosition = computed(() => props.portfolio.positions.find((p) => p.symbol === selected.value))
const fmt8 = (n: number) => fmtSignificant(n, 8)
</script>

<template>
  <SummaryTiles
    :tiles="standardTiles({ openCost: portfolio.totalOpenCost, currentValue: portfolio.totalCurrentValue, unrealized: portfolio.totalUnrealizedPnL, realized: portfolio.totalRealizedPnL, cash: portfolio.cash }, portfolio.currency)"
  />
  <PositionsTable :positions="portfolio.positions" :currency="portfolio.currency" balance-header="Balance" :format-balance="fmt8" min-width="min-w-[700px]" :selected-symbol="selected" @select="(s) => (selected = selected === s ? null : s)" />
  <AssetChart v-if="selectedPosition" :key="selectedPosition.symbol" kind="crypto" :symbol="selectedPosition.symbol" :name="selectedPosition.name" :currency="portfolio.currency as 'EUR' | 'USD'" :trades="portfolio.trades" @close="selected = null" />

  <CashPanel kind="crypto" :portfolio="portfolio" />

  <template v-if="portfolio.canEdit">
    <CryptoTradeForm v-if="adding" :portfolio="portfolio" @done="adding = false" />
    <Button v-else variant="link" class="mb-4 font-normal" @click="adding = true">+ Record trade</Button>
  </template>

  <TradeHistory :trades="portfolio.trades" :currency="portfolio.currency" :format-amount="fmt8" />
</template>
