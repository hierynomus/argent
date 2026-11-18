<script setup lang="ts">
import { computed, ref } from "vue"
import type { CryptoTrade, HistoryRange, StockTrade } from "@argent/shared"
import { useAssetHistory } from "../../api"
import LineChart, { type ChartMarker } from "../../components/charts/LineChart.vue"
import { Button, Card, ErrorText, LoadingText, SegmentedControl } from "../../components/ui"
import { fmtDate, fmtPrice, fmtSignificant, pnlColor } from "../../lib/format"

/**
 * The price of one asset over time, with the portfolio's buys (▲) and sells (▼) of it marked on the line.
 * Prices are per unit in the portfolio's currency. Swaps are not marked (their price is in another coin).
 */
const props = defineProps<{
  kind: "crypto" | "stocks"
  symbol: string
  name: string
  currency: "EUR" | "USD"
  trades: Array<CryptoTrade | StockTrade>
}>()
const emit = defineEmits<{ close: [] }>()

const RANGES: Array<{ value: HistoryRange; label: string }> = [
  { value: "1m", label: "1M" },
  { value: "3m", label: "3M" },
  { value: "6m", label: "6M" },
  { value: "1y", label: "1Y" },
  { value: "max", label: "Max" },
]
const RANGE_NAMES: Record<HistoryRange, string> = { "1m": "last month", "3m": "last 3 months", "6m": "last 6 months", "1y": "last year", max: "all time" }

const range = ref<HistoryRange>("1y")
const { data, isLoading, error, refetch, isFetching } = useAssetHistory(props.kind, () => props.symbol, () => props.currency, range)
const points = computed(() => data.value?.points ?? [])

const fmtQty = (n: number) => fmtSignificant(n, 8)
/** Buys and sells of this asset against the portfolio currency, at the price actually paid / received. */
const markers = computed<ChartMarker[]>(() => {
  const out: ChartMarker[] = []
  for (const t of props.trades) {
    const when = new Date(`${t.tradeDate}T12:00:00`).getTime()
    if (t.toSymbol === props.symbol && t.fromSymbol === props.currency) {
      const qty = parseFloat(t.toAmount)
      const price = parseFloat(t.fromAmount) / qty
      out.push({ t: when, v: price, kind: "buy", label: `${fmtDate(t.tradeDate)}: bought ${fmtQty(qty)} ${props.symbol} at ${fmtPrice(price, props.currency)}` })
    } else if (t.fromSymbol === props.symbol && t.toSymbol === props.currency) {
      const qty = parseFloat(t.fromAmount)
      const price = parseFloat(t.toAmount) / qty
      out.push({ t: when, v: price, kind: "sell", label: `${fmtDate(t.tradeDate)}: sold ${fmtQty(qty)} ${props.symbol} at ${fmtPrice(price, props.currency)}` })
    }
  }
  return out
})

const change = computed(() => {
  if (points.value.length < 2) return null
  const first = points.value[0].v
  const last = points.value[points.value.length - 1].v
  return { abs: last - first, pct: first === 0 ? 0 : ((last - first) / first) * 100 }
})
const fmtPct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(2).replace(".", ",")}%`

const price = (v: number) => fmtPrice(v, props.currency)
const day = (t: number) => fmtDate(new Date(t).toISOString().slice(0, 10))

// the same data as a table, a few dozen rows at most
const tableRows = computed(() => {
  const step = Math.max(1, Math.ceil(points.value.length / 30))
  return points.value.filter((_, i) => i % step === 0 || i === points.value.length - 1)
})
</script>

<template>
  <Card class="p-4 mb-4" data-testid="asset-chart">
    <div class="flex items-start justify-between gap-3 flex-wrap mb-3">
      <div>
        <h2 class="text-base font-semibold text-gray-900 dark:text-gray-100">{{ name }} <span class="font-mono text-sm text-gray-500 dark:text-gray-400">{{ symbol }}</span></h2>
        <p v-if="change" class="text-sm mt-0.5">
          <span class="text-gray-500 dark:text-gray-400">{{ RANGE_NAMES[range] }}: </span>
          <span class="font-medium tabular-nums" :class="pnlColor(change.abs)">{{ fmtPct(change.pct) }} ({{ change.abs >= 0 ? "+" : "" }}{{ price(change.abs) }})</span>
        </p>
      </div>
      <div class="flex items-center gap-2">
        <SegmentedControl v-model="range" :options="RANGES" padding="px-2.5 py-1" />
        <Button variant="muted-link" size="sm" aria-label="Close chart" @click="emit('close')">Close</Button>
      </div>
    </div>

    <LoadingText v-if="isLoading">Loading price history…</LoadingText>
    <div v-else-if="error" class="py-6 text-center">
      <ErrorText :error="error" />
      <Button variant="secondary" size="sm" class="rounded-md mt-3" :disabled="isFetching" @click="refetch()">{{ isFetching ? "Trying…" : "Try again" }}</Button>
    </div>
    <p v-else-if="points.length === 0" class="text-sm text-gray-400 dark:text-gray-500 py-8 text-center">No price history is available for {{ symbol }}.</p>
    <template v-else>
      <LineChart :points="points" :markers="markers" :format-value="price" :format-date="day" :label="`${name} price in ${currency}, ${RANGE_NAMES[range]}`" />
      <div v-if="markers.length > 0" class="flex gap-4 mt-2 text-xs text-gray-500 dark:text-gray-400" aria-label="Legend">
        <span class="inline-flex items-center gap-1"><span class="inline-block w-4 h-0.5 bg-indigo-600 dark:bg-indigo-400" />Price</span>
        <span class="inline-flex items-center gap-1"><span class="text-green-600 dark:text-green-400" aria-hidden="true">▲</span>Bought</span>
        <span class="inline-flex items-center gap-1"><span class="text-red-600 dark:text-red-400" aria-hidden="true">▼</span>Sold</span>
      </div>
      <details class="mt-3 text-xs">
        <summary class="cursor-pointer text-gray-500 dark:text-gray-400">Show data as a table</summary>
        <table class="mt-2 w-full max-w-sm">
          <thead>
            <tr class="text-left text-gray-400 dark:text-gray-500"><th class="py-1 font-medium">Date</th><th class="py-1 font-medium text-right">Price ({{ currency }})</th></tr>
          </thead>
          <tbody class="divide-y divide-gray-100 dark:divide-gray-800">
            <tr v-for="p in tableRows" :key="p.t"><td class="py-1 text-gray-600 dark:text-gray-400">{{ day(p.t) }}</td><td class="py-1 text-right tabular-nums text-gray-900 dark:text-gray-100">{{ price(p.v) }}</td></tr>
          </tbody>
        </table>
      </details>
    </template>
  </Card>
</template>
