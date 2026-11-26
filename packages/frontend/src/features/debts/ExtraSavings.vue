<script setup lang="ts">
import type { ExtraPaymentImpact } from "@argent/shared"
import { fmtCur, fmtDate } from "../../lib/format"
import { fmtMonths } from "./extraSavings"

/** What the extra payments of one part have saved so far, against paying it off as scheduled. */
defineProps<{ impact: ExtraPaymentImpact; currency: string }>()
</script>

<template>
  <div class="mb-3 grid grid-cols-2 sm:grid-cols-4 gap-3 rounded-lg bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-900 px-3 py-2.5" aria-label="Savings from extra payments">
    <div>
      <p class="text-xs text-gray-500 dark:text-gray-400">Paid extra</p>
      <p class="text-sm font-semibold tabular-nums text-gray-900 dark:text-gray-100">{{ fmtCur(impact.totalExtra, currency) }}</p>
      <p class="text-xs text-gray-400 dark:text-gray-500">{{ impact.count }} {{ impact.count === 1 ? "payment" : "payments" }}</p>
    </div>
    <div>
      <p class="text-xs text-gray-500 dark:text-gray-400">Interest saved</p>
      <p class="text-sm font-semibold tabular-nums text-green-700 dark:text-green-300">{{ fmtCur(impact.interestSaved, currency) }}</p>
      <p class="text-xs text-gray-400 dark:text-gray-500">{{ fmtCur(impact.interestWithExtra, currency) }} instead of {{ fmtCur(impact.interestWithoutExtra, currency) }}</p>
    </div>
    <div>
      <p class="text-xs text-gray-500 dark:text-gray-400">Paid off sooner</p>
      <p class="text-sm font-semibold tabular-nums text-green-700 dark:text-green-300">{{ impact.monthsSaved > 0 ? fmtMonths(impact.monthsSaved) : "Same end date" }}</p>
      <p class="text-xs text-gray-400 dark:text-gray-500">{{ impact.monthsSaved > 0 ? "" : "the payment is lower instead" }}</p>
    </div>
    <div>
      <p class="text-xs text-gray-500 dark:text-gray-400">Last payment</p>
      <p class="text-sm font-semibold tabular-nums text-gray-900 dark:text-gray-100">{{ fmtDate(impact.endDate) }}</p>
      <p v-if="impact.endDate !== impact.endDateWithoutExtra" class="text-xs text-gray-400 dark:text-gray-500">was {{ fmtDate(impact.endDateWithoutExtra) }}</p>
    </div>
  </div>
</template>
