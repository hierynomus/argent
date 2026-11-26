<script setup lang="ts">
import { computed } from "vue"
import { useBalanceHistory } from "../../api"
import LineChart, { type ChartPoint } from "../../components/charts/LineChart.vue"
import { fmtCur, fmtDate } from "../../lib/format"

/** The balance of one account over time, as a step line (it stays flat until the next day with transactions). */
const props = defineProps<{ accountId: string; name: string }>()
const { data } = useBalanceHistory(() => props.accountId)

const points = computed<ChartPoint[]>(() =>
  (data.value?.points ?? []).map((p) => ({ t: new Date(`${p.date}T12:00:00`).getTime(), v: parseFloat(p.balance) })),
)
const money = (n: number) => fmtCur(n, data.value?.currency ?? "EUR")
const day = (t: number) => fmtDate(new Date(t).toISOString().slice(0, 10))
</script>

<template>
  <div v-if="points.length >= 2" class="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800">
    <h2 class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Balance over time</h2>
    <LineChart :points="points" :format-value="money" :format-date="day" step :label="`${name} balance over time`" />
  </div>
</template>
