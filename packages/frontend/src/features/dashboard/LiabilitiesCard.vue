<script setup lang="ts">
import { computed } from "vue"
import { fmtCur } from "../../lib/format"

const props = defineProps<{ mortgageBalance: number; mortgageMonthly: number; mortgageCount: number; loanBalance: number; loanMonthly: number; loanCount: number }>()
const hasAny = computed(() => props.mortgageCount > 0 || props.loanCount > 0)
</script>

<template>
  <div class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
    <p class="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">Liabilities</p>
    <p v-if="!hasAny" class="text-sm text-gray-400 dark:text-gray-500">No mortgages or loans recorded.</p>
    <div v-else class="space-y-3">
      <div v-if="mortgageCount > 0" class="flex items-center justify-between">
        <span class="text-sm text-gray-500 dark:text-gray-400">Mortgages<span class="ml-1.5 text-xs text-gray-400 dark:text-gray-500">({{ mortgageCount }})</span></span>
        <div class="text-right tabular-nums">
          <span class="text-sm font-semibold text-gray-800 dark:text-gray-200">{{ fmtCur(mortgageBalance) }}</span>
          <span class="text-xs text-gray-400 dark:text-gray-500 ml-1.5">{{ fmtCur(mortgageMonthly) }}/mo</span>
        </div>
      </div>
      <div v-if="loanCount > 0" class="flex items-center justify-between">
        <span class="text-sm text-gray-500 dark:text-gray-400">Loans<span class="ml-1.5 text-xs text-gray-400 dark:text-gray-500">({{ loanCount }})</span></span>
        <div class="text-right tabular-nums">
          <span class="text-sm font-semibold text-gray-800 dark:text-gray-200">{{ fmtCur(loanBalance) }}</span>
          <span class="text-xs text-gray-400 dark:text-gray-500 ml-1.5">{{ fmtCur(loanMonthly) }}/mo</span>
        </div>
      </div>
      <div v-if="mortgageCount > 0 && loanCount > 0" class="border-t border-gray-100 dark:border-gray-800 pt-3 flex items-center justify-between">
        <span class="text-sm font-medium text-gray-700 dark:text-gray-300">Total</span>
        <div class="text-right tabular-nums">
          <span class="text-sm font-bold text-gray-900 dark:text-gray-100">{{ fmtCur(mortgageBalance + loanBalance) }}</span>
          <span class="text-xs text-gray-400 dark:text-gray-500 ml-1.5">{{ fmtCur(mortgageMonthly + loanMonthly) }}/mo</span>
        </div>
      </div>
    </div>
  </div>
</template>
