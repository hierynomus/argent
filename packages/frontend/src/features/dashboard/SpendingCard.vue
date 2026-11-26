<script setup lang="ts">
import { computed, ref } from "vue"
import { RouterLink } from "vue-router"
import { useCategories, useTransactionSummary } from "../../api"
import { Card, SegmentedControl } from "../../components/ui"
import { fmtCur, fmtMonthLabel } from "../../lib/format"
import Skeleton from "./Skeleton.vue"
import { spendingByCategory } from "./spending"
import { monthRange } from "./spendingPeriod"

/**
 * Where the money of a month went: a bar per category (largest first) with the comparison (last month, or the
 * average of the three months before) as a tick on the same scale, so what grew or shrank stands out. Step back
 * through the months with the arrows; click a category to see the transactions behind it.
 * Subcategories count with their parent.
 */
const props = withDefaults(defineProps<{ today?: string }>(), { today: () => new Date().toISOString().slice(0, 10) })

const offset = ref(0)
const compare = ref<"last" | "average">("last")
const COMPARE = [{ value: "last", label: "Last month" }, { value: "average", label: "3-month average" }] as const

const month = computed(() => monthRange(props.today, offset.value))
const comparisonMonths = computed(() => Array.from({ length: compare.value === "last" ? 1 : 3 }, (_, i) => monthRange(props.today, offset.value + 1 + i)))
// up to three months before, fetched in fixed slots so each has a stable key
const [m1, m2, m3] = [computed(() => comparisonMonths.value[0]!), computed(() => comparisonMonths.value[1] ?? comparisonMonths.value[0]!), computed(() => comparisonMonths.value[2] ?? comparisonMonths.value[0]!)]
const { data: current, isLoading } = useTransactionSummary(() => month.value.from, () => month.value.to)
const { data: c1 } = useTransactionSummary(() => m1.value.from, () => m1.value.to)
const { data: c2 } = useTransactionSummary(() => m2.value.from, () => m2.value.to)
const { data: c3 } = useTransactionSummary(() => m3.value.from, () => m3.value.to)
const { data: categories } = useCategories()

const spending = computed(() => {
  if (!current.value) return { rows: [], total: 0, previousTotal: 0 }
  const wanted = comparisonMonths.value.length
  const comparison = [c1.value, c2.value, c3.value].slice(0, wanted).filter((s): s is NonNullable<typeof s> => !!s)
  return spendingByCategory(current.value, comparison, categories.value ?? [])
})
const scale = computed(() => Math.max(1, ...spending.value.rows.flatMap((r) => [r.amount, r.previous])))
const pct = (n: number) => `${Math.min(100, (n / scale.value) * 100)}%`
const change = (amount: number, previous: number) => {
  if (previous <= 0) return null
  const p = ((amount - previous) / previous) * 100
  return Math.abs(p) < 1 ? null : { up: p > 0, text: `${p > 0 ? "▲" : "▼"} ${Math.abs(p).toFixed(0)}%` }
}
const totalChange = computed(() => change(spending.value.total, spending.value.previousTotal))
const versus = computed(() => (compare.value === "last" ? "last month" : "the 3-month average"))
const monthName = computed(() => fmtMonthLabel(month.value.date))

/** the transactions behind a row: its labels, that month, money out, no transfers between own accounts */
const detail = (row: { name: string; categoryIds: string[] }) => ({
  path: "/overview",
  query: { categories: row.categoryIds.join(","), from: month.value.from, to: month.value.to, direction: "DBIT", excludeTransfers: "1", currency: "EUR", label: row.name },
})
</script>

<template>
  <Card size="xl" class="p-6" aria-label="Spending by category">
    <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 mb-1">
      <p class="text-sm font-semibold text-gray-700 dark:text-gray-300">Spending by category</p>
      <div class="flex items-center gap-1 text-sm text-gray-700 dark:text-gray-300">
        <button type="button" class="px-2.5 py-0 text-lg leading-6 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800" aria-label="Previous month" @click="offset++">‹</button>
        <span class="min-w-32 text-center font-medium tabular-nums" aria-live="polite">{{ monthName }}</span>
        <button type="button" class="px-2.5 py-0 text-lg leading-6 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30 disabled:hover:bg-transparent" aria-label="Next month" :disabled="offset === 0" @click="offset--">›</button>
      </div>
    </div>
    <div class="flex flex-wrap items-center justify-between gap-2 mb-4">
      <SegmentedControl v-model="compare" :options="COMPARE" padding="px-2 py-0.5" />
      <p v-if="!isLoading && spending.rows.length > 0" class="text-sm tabular-nums text-gray-500 dark:text-gray-400">
        <span class="font-semibold text-gray-800 dark:text-gray-100">{{ fmtCur(spending.total) }}</span>
        <span v-if="totalChange" class="ml-1.5 text-xs" :class="totalChange.up ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'">{{ totalChange.text }} vs {{ versus }}</span>
      </p>
    </div>

    <div v-if="isLoading" class="space-y-3"><Skeleton class="h-5 w-full" /><Skeleton class="h-5 w-full" /><Skeleton class="h-5 w-3/4" /></div>
    <p v-else-if="spending.rows.length === 0" class="text-sm text-gray-400 dark:text-gray-500">No spending {{ offset === 0 ? "yet this month" : `in ${monthName}` }}.</p>
    <ul v-else class="space-y-1">
      <li v-for="r in spending.rows" :key="r.key">
        <RouterLink :to="detail(r)" class="block rounded-md px-2 py-1.5 -mx-2 hover:bg-gray-50 dark:hover:bg-gray-800/60 focus-visible:outline-2 focus-visible:outline-indigo-500" :title="`Show the ${r.name} transactions`">
          <div class="flex items-baseline justify-between gap-3 text-sm">
            <span class="truncate text-gray-700 dark:text-gray-300">{{ r.name }}<span class="ml-1.5 text-xs text-gray-400 dark:text-gray-500">{{ r.percent.toFixed(0) }}%</span></span>
            <span class="shrink-0 tabular-nums">
              <span class="font-medium text-gray-900 dark:text-gray-100">{{ fmtCur(r.amount) }}</span>
              <span v-if="change(r.amount, r.previous)" class="ml-2 text-xs" :class="change(r.amount, r.previous)!.up ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'">{{ change(r.amount, r.previous)!.text }}</span>
            </span>
          </div>
          <div class="relative mt-1 h-2 rounded-full bg-gray-100 dark:bg-gray-800" role="img" :aria-label="`${r.name}: ${fmtCur(r.amount)}, ${fmtCur(r.previous)} ${versus}`">
            <div class="h-2 rounded-full" :class="r.key === 'none' ? 'bg-gray-400 dark:bg-gray-500' : 'bg-indigo-500 dark:bg-indigo-400'" :style="{ width: pct(r.amount), ...(r.color ? { backgroundColor: r.color } : {}) }" />
            <div v-if="r.previous > 0" class="absolute top-[-2px] h-3 w-0.5 rounded bg-gray-700 dark:bg-gray-200" :style="{ left: pct(r.previous) }" :title="`${versus}: ${fmtCur(r.previous)}`" />
          </div>
        </RouterLink>
      </li>
    </ul>
    <p v-if="!isLoading && spending.rows.length > 0" class="mt-3 text-xs text-gray-400 dark:text-gray-500">The tick marks {{ versus }}. Transfers between your own accounts are not counted. Click a category for its transactions.</p>
  </Card>
</template>
