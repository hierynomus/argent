<script setup lang="ts">
import { computed } from "vue"
import { useDebtSchedule, type DebtKind } from "../../api"
import LineChart, { type ChartPoint } from "../../components/charts/LineChart.vue"
import { fmtCur, fmtDate } from "../../lib/format"

/**
 * The balance of a mortgage/loan over its whole life: solid up to today, dashed from then on (the projection at the
 * current installments), and a dotted grey line for the course it would have taken without the extra payments.
 */
const props = defineProps<{ kind: DebtKind; debtId: string; name: string }>()
const { data } = useDebtSchedule(props.kind, () => props.debtId)

const at = (iso: string) => new Date(`${iso}T12:00:00Z`).getTime()
const toPoints = (rows: Array<{ date: string; balance: number }>): ChartPoint[] => rows.map((p) => ({ t: at(p.date), v: p.balance }))
const points = computed(() => toPoints(data.value?.actual ?? []))
const reference = computed(() => (data.value?.scheduled ? toPoints(data.value.scheduled) : undefined))
const money = (n: number) => fmtCur(n, data.value?.currency ?? "EUR")
const day = (t: number) => fmtDate(new Date(t).toISOString().slice(0, 10))
</script>

<template>
  <div v-if="points.length >= 2" class="px-6 py-4 border-b border-gray-100 dark:border-gray-800">
    <div class="flex flex-wrap items-baseline justify-between gap-2 mb-2">
      <h3 class="text-sm font-medium text-gray-700 dark:text-gray-300">Balance over time</h3>
      <p class="text-xs text-gray-400 dark:text-gray-500">
        <span class="inline-block w-4 border-t-2 border-indigo-600 dark:border-indigo-400 align-middle mr-1" />paid so far
        <span class="inline-block w-4 border-t-2 border-dashed border-indigo-600 dark:border-indigo-400 align-middle ml-3 mr-1" />projection
        <template v-if="reference"><span class="inline-block w-4 border-t-2 border-dotted border-gray-400 align-middle ml-3 mr-1" />without extra payments</template>
      </p>
    </div>
    <LineChart
      :points="points"
      :reference="reference"
      reference-label="Without extra payments"
      :projected-from="data ? at(data.today) : undefined"
      :format-value="money"
      :format-date="day"
      :label="`${name} balance over its term`"
    />
  </div>
</template>
