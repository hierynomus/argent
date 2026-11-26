<script setup lang="ts">
import { computed } from "vue"
import type { ExtraPaymentImpact } from "@argent/shared"
import { fmtCur, fmtDate } from "../../lib/format"
import { fmtMonths } from "./extraSavings"

/**
 * What the extra payments of one part have saved so far, against paying it off as scheduled: the interest
 * saved as the headline, the interest with and without them as two bars on one scale, and the end date.
 */
const props = defineProps<{ impact: ExtraPaymentImpact; currency: string }>()

const money = (n: number) => fmtCur(n, props.currency)
const scale = computed(() => Math.max(props.impact.interestWithoutExtra, props.impact.interestWithExtra, 1))
const width = (n: number) => `${Math.max(2, Math.round((n / scale.value) * 100))}%`
/** what each euro paid extra saved in interest */
const perEuro = computed(() => (props.impact.totalExtra > 0 ? props.impact.interestSaved / props.impact.totalExtra : 0))
const sooner = computed(() => props.impact.monthsSaved > 0)
</script>

<template>
  <section
    class="mb-4 rounded-xl border border-green-200 dark:border-green-900 bg-green-50/70 dark:bg-green-950/30 p-4 sm:p-5 grid gap-5 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] items-center"
    aria-label="Savings from extra payments"
  >
    <div>
      <p class="text-xs font-medium uppercase tracking-wide text-green-700 dark:text-green-400">Interest saved</p>
      <p class="mt-1 text-3xl font-bold tabular-nums text-green-700 dark:text-green-300">{{ money(impact.interestSaved) }}</p>
      <p class="mt-1 text-sm text-gray-600 dark:text-gray-300">
        by paying <span class="font-medium tabular-nums">{{ money(impact.totalExtra) }}</span> extra in {{ impact.count }} {{ impact.count === 1 ? "payment" : "payments" }}<template v-if="perEuro > 0">,
        <span class="whitespace-nowrap">{{ money(perEuro) }} back for every {{ money(1) }}</span></template>.
      </p>
      <p v-if="sooner" class="mt-3 inline-flex items-center gap-1.5 rounded-full bg-green-100 dark:bg-green-900/60 px-2.5 py-1 text-xs font-medium text-green-800 dark:text-green-200">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15 14" /></svg>
        Paid off {{ fmtMonths(impact.monthsSaved) }} sooner
      </p>
      <p v-else class="mt-3 text-xs text-gray-500 dark:text-gray-400">The payment is lower instead, so the end date stays the same.</p>
    </div>

    <div class="space-y-3 text-sm">
      <div>
        <div class="flex items-baseline justify-between gap-2 text-xs text-gray-500 dark:text-gray-400"><span>Interest as scheduled</span><span class="tabular-nums text-gray-700 dark:text-gray-300">{{ money(impact.interestWithoutExtra) }}</span></div>
        <div class="mt-1 h-2 rounded-full bg-gray-200/70 dark:bg-gray-700/60"><div class="h-2 rounded-full bg-gray-400 dark:bg-gray-500" :style="{ width: width(impact.interestWithoutExtra) }" /></div>
      </div>
      <div>
        <div class="flex items-baseline justify-between gap-2 text-xs text-gray-500 dark:text-gray-400"><span>Interest with extra payments</span><span class="tabular-nums font-medium text-green-700 dark:text-green-300">{{ money(impact.interestWithExtra) }}</span></div>
        <div class="mt-1 h-2 rounded-full bg-gray-200/70 dark:bg-gray-700/60"><div class="h-2 rounded-full bg-green-500 dark:bg-green-400" :style="{ width: width(impact.interestWithExtra) }" /></div>
      </div>
      <p class="flex flex-wrap items-baseline justify-between gap-x-3 border-t border-green-200/70 dark:border-green-900/70 pt-2.5 text-xs text-gray-500 dark:text-gray-400">
        <span>Last payment</span>
        <span class="tabular-nums">
          <span v-if="impact.endDate !== impact.endDateWithoutExtra" class="mr-1.5 line-through opacity-70">{{ fmtDate(impact.endDateWithoutExtra) }}</span>
          <span class="font-medium text-gray-800 dark:text-gray-100">{{ fmtDate(impact.endDate) }}</span>
        </span>
      </p>
    </div>
  </section>
</template>
