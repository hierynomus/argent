<script setup lang="ts">
import { computed } from "vue"
import type { Category, TransactionWithDetails } from "@argent/shared"
import { Card } from "../../components/ui"
import { fmtCur } from "../../lib/format"
import Skeleton from "./Skeleton.vue"
import { spendingByCategory } from "./spending"

/**
 * Where this month's money went: a bar per category (largest first) with last month's figure as a tick on the
 * same scale, so what grew or shrank stands out. Subcategories count with their parent.
 */
const props = defineProps<{ current: TransactionWithDetails[]; previous: TransactionWithDetails[]; categories: Category[]; loading: boolean; monthLabel: string }>()

const spending = computed(() => spendingByCategory(props.current, props.previous, props.categories))
const scale = computed(() => Math.max(1, ...spending.value.rows.flatMap((r) => [r.amount, r.previous])))
const pct = (n: number) => `${Math.min(100, (n / scale.value) * 100)}%`
const change = (amount: number, previous: number) => {
  if (previous <= 0) return null
  const p = ((amount - previous) / previous) * 100
  return Math.abs(p) < 1 ? null : { up: p > 0, text: `${p > 0 ? "▲" : "▼"} ${Math.abs(p).toFixed(0)}%` }
}
const totalChange = computed(() => change(spending.value.total, spending.value.previousTotal))
</script>

<template>
  <Card size="xl" class="p-6" aria-label="Spending by category">
    <div class="flex items-baseline justify-between gap-3 mb-4">
      <p class="text-sm font-semibold text-gray-700 dark:text-gray-300">Spending by category — {{ monthLabel }}</p>
      <p v-if="!loading && spending.rows.length > 0" class="text-sm tabular-nums text-gray-500 dark:text-gray-400">
        <span class="font-semibold text-gray-800 dark:text-gray-100">{{ fmtCur(spending.total) }}</span>
        <span v-if="totalChange" class="ml-1.5 text-xs" :class="totalChange.up ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'">{{ totalChange.text }} vs last month</span>
      </p>
    </div>

    <div v-if="loading" class="space-y-3"><Skeleton class="h-5 w-full" /><Skeleton class="h-5 w-full" /><Skeleton class="h-5 w-3/4" /></div>
    <p v-else-if="spending.rows.length === 0" class="text-sm text-gray-400 dark:text-gray-500">No spending yet this month.</p>
    <ul v-else class="space-y-3">
      <li v-for="r in spending.rows" :key="r.key">
        <div class="flex items-baseline justify-between gap-3 text-sm">
          <span class="truncate text-gray-700 dark:text-gray-300">{{ r.name }}<span class="ml-1.5 text-xs text-gray-400 dark:text-gray-500">{{ r.percent.toFixed(0) }}%</span></span>
          <span class="shrink-0 tabular-nums">
            <span class="font-medium text-gray-900 dark:text-gray-100">{{ fmtCur(r.amount) }}</span>
            <span v-if="change(r.amount, r.previous)" class="ml-2 text-xs" :class="change(r.amount, r.previous)!.up ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'">{{ change(r.amount, r.previous)!.text }}</span>
          </span>
        </div>
        <div class="relative mt-1 h-2 rounded-full bg-gray-100 dark:bg-gray-800" role="img" :aria-label="`${r.name}: ${fmtCur(r.amount)} this month, ${fmtCur(r.previous)} last month`">
          <div class="h-2 rounded-full" :class="r.key === 'none' ? 'bg-gray-400 dark:bg-gray-500' : 'bg-indigo-500 dark:bg-indigo-400'" :style="{ width: pct(r.amount), ...(r.color ? { backgroundColor: r.color } : {}) }" />
          <!-- last month on the same scale -->
          <div v-if="r.previous > 0" class="absolute top-[-2px] h-3 w-0.5 rounded bg-gray-700 dark:bg-gray-200" :style="{ left: pct(r.previous) }" :title="`Last month: ${fmtCur(r.previous)}`" />
        </div>
      </li>
    </ul>
    <p v-if="!loading && spending.rows.length > 0" class="mt-4 text-xs text-gray-400 dark:text-gray-500">The tick marks last month. Transfers between your own accounts are not counted.</p>
  </Card>
</template>
