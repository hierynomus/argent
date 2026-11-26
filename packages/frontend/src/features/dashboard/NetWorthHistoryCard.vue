<script setup lang="ts">
import { computed, ref } from "vue"
import type { HistoryRange } from "@argent/shared"
import { useNetWorthHistory } from "../../api"
import LineChart, { type ChartPoint } from "../../components/charts/LineChart.vue"
import { Card, SegmentedControl } from "../../components/ui"
import { fmtCur, fmtDate, pnlColor } from "../../lib/format"
import { sliceRange } from "../accounts/balanceRange"

/**
 * Net worth over the years, with the change over the chosen range as the headline. It is built by the server
 * from the dated facts (bank balances, debts, property valuations, pension statements) and values investments
 * at what they cost, since no price history is kept.
 */
const { data } = useNetWorthHistory()

const RANGES: Array<{ value: HistoryRange; label: string }> = [
  { value: "3m", label: "3M" },
  { value: "6m", label: "6M" },
  { value: "1y", label: "1Y" },
  { value: "max", label: "All" },
]
const RANGE_NAMES: Record<HistoryRange, string> = { "1m": "last month", "3m": "last 3 months", "6m": "last 6 months", "1y": "last year", max: "since the start" }
const range = ref<HistoryRange>("1y")

const shown = computed(() => sliceRange(data.value?.points ?? [], range.value))
const points = computed<ChartPoint[]>(() => shown.value.map((p) => ({ t: new Date(`${p.date}T12:00:00Z`).getTime(), v: p.netWorth })))
const change = computed(() => {
  const first = shown.value[0]
  const last = shown.value[shown.value.length - 1]
  if (!first || !last || first === last) return null
  const delta = Math.round((last.netWorth - first.netWorth) * 100) / 100
  return { delta, percent: first.netWorth > 0 ? (delta / first.netWorth) * 100 : null }
})
const money = (n: number) => fmtCur(n)
const day = (t: number) => fmtDate(new Date(t).toISOString().slice(0, 10))
</script>

<template>
  <Card v-if="(data?.points.length ?? 0) >= 2" size="xl" class="px-8 py-6" aria-label="Net worth over time">
    <div class="flex flex-wrap items-start justify-between gap-4 mb-3">
      <div>
        <p class="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">Net worth over time</p>
        <p v-if="change" class="mt-1 text-sm text-gray-500 dark:text-gray-400">
          <span class="text-xl font-bold tabular-nums" :class="pnlColor(change.delta)">{{ change.delta >= 0 ? "+" : "−" }}{{ money(Math.abs(change.delta)) }}</span>
          <span v-if="change.percent !== null" class="ml-1.5 tabular-nums" :class="pnlColor(change.delta)">({{ change.delta >= 0 ? "+" : "−" }}{{ Math.abs(change.percent).toFixed(1) }}%)</span>
          <span class="ml-1.5">{{ RANGE_NAMES[range] }}</span>
        </p>
      </div>
      <SegmentedControl v-model="range" :options="RANGES" padding="px-2.5 py-1" />
    </div>
    <LineChart v-if="points.length >= 2" :points="points" :format-value="money" :format-date="day" :label="`Net worth, ${RANGE_NAMES[range]}`" />
    <p class="mt-2 text-xs text-gray-400 dark:text-gray-500">Banking, debts, property and pensions as they were on each day; crypto, stocks and metals at what they cost (no price history is kept). Options are not included. EUR only.</p>
  </Card>
</template>
