<script setup lang="ts">
import { computed, ref } from "vue"
import type { HistoryRange } from "@argent/shared"
import { useBalanceHistory } from "../../api"
import LineChart, { type ChartPoint } from "../../components/charts/LineChart.vue"
import { SegmentedControl } from "../../components/ui"
import { fmtCur, fmtDate } from "../../lib/format"
import { sliceRange } from "./balanceRange"

/** The balance of one account over time, as a step line (it stays flat until the next day with transactions). */
const props = defineProps<{ accountId: string; name: string }>()
const { data } = useBalanceHistory(() => props.accountId)

const RANGES: Array<{ value: HistoryRange; label: string }> = [
  { value: "1m", label: "1M" },
  { value: "3m", label: "3M" },
  { value: "6m", label: "6M" },
  { value: "1y", label: "1Y" },
  { value: "max", label: "All" },
]
const RANGE_NAMES: Record<HistoryRange, string> = { "1m": "last month", "3m": "last 3 months", "6m": "last 6 months", "1y": "last year", max: "all time" }
const range = ref<HistoryRange>("1y")

const hasHistory = computed(() => (data.value?.points.length ?? 0) >= 2)
const points = computed<ChartPoint[]>(() =>
  sliceRange(data.value?.points ?? [], range.value).map((p) => ({ t: new Date(`${p.date}T12:00:00`).getTime(), v: parseFloat(p.balance) })),
)
const money = (n: number) => fmtCur(n, data.value?.currency ?? "EUR")
const day = (t: number) => fmtDate(new Date(t).toISOString().slice(0, 10))
</script>

<template>
  <div v-if="hasHistory" class="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800">
    <div class="flex items-center justify-between gap-3 mb-2">
      <h2 class="text-sm font-medium text-gray-700 dark:text-gray-300">Balance over time</h2>
      <SegmentedControl v-model="range" :options="RANGES" padding="px-2.5 py-1" />
    </div>
    <LineChart v-if="points.length >= 2" :points="points" :format-value="money" :format-date="day" step :label="`${name} balance, ${RANGE_NAMES[range]}`" />
    <p v-else class="text-sm text-gray-400 dark:text-gray-500 py-6 text-center">No transactions in the {{ RANGE_NAMES[range] }}.</p>
  </div>
</template>
