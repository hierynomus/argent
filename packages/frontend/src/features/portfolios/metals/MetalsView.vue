<script setup lang="ts">
import { ref } from "vue"
import type { MetalPortfolioDetail } from "@argent/shared"
import { Button } from "../../../components/ui"
import SummaryTiles from "../SummaryTiles.vue"
import { standardTiles } from "../tiles"
import LotForm from "./LotForm.vue"
import LotsTable from "./LotsTable.vue"

/** What is inside a precious-metals portfolio: totals, the lots inventory, and the add-lot form. */
defineProps<{ portfolio: MetalPortfolioDetail }>()
const adding = ref(false)
</script>

<template>
  <SummaryTiles
    :tiles="standardTiles({ openCost: portfolio.totalInvestedOpen, currentValue: portfolio.totalCurrentValueOpen, unrealized: portfolio.totalUnrealizedPnL, realized: portfolio.totalRealizedPnL }, portfolio.currency)"
  />
  <LotsTable :portfolio-id="portfolio.id" :lots="portfolio.lots" :currency="portfolio.currency" :can-edit="portfolio.canEdit" />

  <template v-if="portfolio.canEdit">
    <LotForm v-if="adding" :portfolio="portfolio" @done="adding = false" />
    <Button v-else variant="link" class="mb-4 font-normal" @click="adding = true">+ Add lot</Button>
  </template>
</template>
