<script setup lang="ts">
import { ref } from "vue"
import type { PortfolioDetail } from "@argent/shared"
import { Button } from "../../../components/ui"
import { fmtSignificant } from "../../../lib/format"
import PositionsTable from "../PositionsTable.vue"
import SummaryTiles from "../SummaryTiles.vue"
import { standardTiles } from "../tiles"
import TradeHistory from "../TradeHistory.vue"
import CryptoTradeForm from "./CryptoTradeForm.vue"

/** What is inside a crypto portfolio: totals, positions, the trade form and the ledger. */
defineProps<{ portfolio: PortfolioDetail }>()
const adding = ref(false)
const fmt8 = (n: number) => fmtSignificant(n, 8)
</script>

<template>
  <SummaryTiles
    :tiles="standardTiles({ openCost: portfolio.totalOpenCostEur, currentValue: portfolio.totalCurrentValueEur, unrealized: portfolio.totalUnrealizedPnL, realized: portfolio.totalRealizedPnL }, portfolio.currency)"
  />
  <PositionsTable :positions="portfolio.positions" :currency="portfolio.currency" balance-header="Balance" :format-balance="fmt8" min-width="min-w-[700px]" />

  <template v-if="portfolio.canEdit">
    <CryptoTradeForm v-if="adding" :portfolio="portfolio" @done="adding = false" />
    <Button v-else variant="link" class="mb-4 font-normal" @click="adding = true">+ Record trade</Button>
  </template>

  <TradeHistory :trades="portfolio.trades" :currency="portfolio.currency" :format-amount="fmt8" />
</template>
