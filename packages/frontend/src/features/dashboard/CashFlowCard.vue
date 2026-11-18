<script setup lang="ts">
import { computed } from "vue"
import { fmtCur } from "../../lib/format"
import Skeleton from "./Skeleton.vue"

const props = defineProps<{ income: number; expenses: number; loading: boolean; monthLabel: string }>()
const net = computed(() => props.income - props.expenses)
</script>

<template>
  <div class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
    <p class="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">Cash Flow — {{ monthLabel }}</p>
    <div v-if="loading" class="space-y-3">
      <Skeleton class="h-5 w-full" />
      <Skeleton class="h-5 w-full" />
      <Skeleton class="h-5 w-3/4" />
    </div>
    <div v-else class="space-y-3">
      <div class="flex items-center justify-between">
        <span class="text-sm text-gray-500 dark:text-gray-400">Income</span>
        <span class="text-sm font-semibold text-green-600 dark:text-green-400 tabular-nums">{{ fmtCur(income) }}</span>
      </div>
      <div class="flex items-center justify-between">
        <span class="text-sm text-gray-500 dark:text-gray-400">Expenses</span>
        <span class="text-sm font-semibold text-red-600 dark:text-red-400 tabular-nums">{{ fmtCur(expenses) }}</span>
      </div>
      <div class="border-t border-gray-100 dark:border-gray-800 pt-3 flex items-center justify-between">
        <span class="text-sm font-medium text-gray-700 dark:text-gray-300">Net</span>
        <span class="text-sm font-bold tabular-nums" :class="net >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'">{{ net >= 0 ? "+" : "" }}{{ fmtCur(net) }}</span>
      </div>
    </div>
  </div>
</template>
