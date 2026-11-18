<script setup lang="ts">
import { computed, ref } from "vue"
import { Card } from "../../components/ui"
import AssetChart from "./AssetChart.vue"
import PositionsTable from "./PositionsTable.vue"
import SummaryTiles from "./SummaryTiles.vue"
import { fmtMaxDecimals, fmtSignificant, fmtSymbolCur } from "../../lib/format"
import { aggregateAssets, type AssetDetail } from "./overview"
import { standardTiles } from "./tiles"

/**
 * The overview tab of crypto and stock pages: every asset in every portfolio the user can see, summed,
 * with the totals on top. Portfolios in different currencies are shown as separate sections.
 */
const props = defineProps<{ kind: "crypto" | "stocks"; details: AssetDetail[] }>()

const groups = computed(() => aggregateAssets(props.details))
const stocks = computed(() => props.kind === "stocks")
const formatBalance = (n: number) => (stocks.value ? fmtMaxDecimals(n, 4) : fmtSignificant(n, 8))

// one chart at a time: "<currency>:<symbol>"
const selected = ref<string | null>(null)
const toggle = (currency: string, symbol: string) => {
  const key = `${currency}:${symbol}`
  selected.value = selected.value === key ? null : key
}
const chartFor = (currency: string) => {
  const [cur, symbol] = (selected.value ?? "").split(":")
  if (cur !== currency) return null
  const group = groups.value.find((g) => g.currency === currency)
  const position = group?.positions.find((p) => p.symbol === symbol)
  return position ? { symbol, name: position.name } : null
}
const tradesOf = (currency: string) => props.details.filter((d) => d.currency === currency).flatMap((d) => d.trades)
const tilesOf = (g: (typeof groups.value)[number]) => [
  ...standardTiles({ openCost: g.openCost, currentValue: g.currentValue, unrealized: g.unrealized, realized: g.realized }, g.currency),
  ...(stocks.value ? [{ label: "Dividends", value: fmtSymbolCur(g.dividends, g.currency), color: g.dividends > 0 ? "text-green-600 dark:text-green-400" : undefined }] : []),
]
</script>

<template>
  <Card v-if="groups.length === 0" class="px-5 py-10 text-center text-gray-400 dark:text-gray-500 text-sm">Nothing to show yet.</Card>
  <section v-for="g in groups" :key="g.currency" :aria-label="`${g.currency} portfolios`" class="mb-8">
    <p class="text-sm text-gray-500 dark:text-gray-400 mb-3">
      <template v-if="groups.length > 1"><span class="font-semibold text-gray-700 dark:text-gray-300">{{ g.currency }}</span> · </template>
      {{ g.portfolioNames.length }} {{ g.portfolioNames.length === 1 ? "portfolio" : "portfolios" }}: {{ g.portfolioNames.join(", ") }}
    </p>
    <SummaryTiles :tiles="tilesOf(g)" />
    <PositionsTable
      :positions="g.positions"
      :currency="g.currency"
      :balance-header="stocks ? 'Shares' : 'Balance'"
      :format-balance="formatBalance"
      :show-dividends="stocks"
      :min-width="stocks ? 'min-w-[780px]' : 'min-w-[700px]'"
      :selected-symbol="chartFor(g.currency)?.symbol ?? null"
      @select="(s) => toggle(g.currency, s)"
    />
    <AssetChart
      v-if="chartFor(g.currency)"
      :key="`${g.currency}:${chartFor(g.currency)!.symbol}`"
      :kind="kind"
      :symbol="chartFor(g.currency)!.symbol"
      :name="chartFor(g.currency)!.name"
      :currency="g.currency as 'EUR' | 'USD'"
      :trades="tradesOf(g.currency)"
      @close="selected = null"
    />
  </section>
</template>
