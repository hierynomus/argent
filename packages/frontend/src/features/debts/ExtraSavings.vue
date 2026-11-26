<script setup lang="ts">
import { computed } from "vue"
import type { ExtraPaymentImpact } from "@argent/shared"
import { fmtCur, fmtDate } from "../../lib/format"
import { fmtMonths } from "./extraSavings"

/**
 * What extra payments have saved against paying as scheduled: the interest saved as the headline, and the
 * interest over the whole term with and without them as two bars on one scale, each split into what has
 * already been paid up to today (dark) and what is still to come (light).
 */
const props = defineProps<{ impact: ExtraPaymentImpact; currency: string; heading?: string }>()

const money = (n: number) => fmtCur(n, props.currency)
const scale = computed(() => Math.max(props.impact.interestWithoutExtra, props.impact.interestWithExtra, 1))
const pct = (n: number) => `${Math.min(100, Math.max(0, (n / scale.value) * 100))}%`
/** each euro paid extra gave this much back in interest */
const perEuro = computed(() => (props.impact.totalExtra > 0 ? props.impact.interestSaved / props.impact.totalExtra : 0))
const sooner = computed(() => props.impact.monthsSaved > 0)

const bars = computed(() => [
  { key: "without", label: "Interest as scheduled", total: props.impact.interestWithoutExtra, paid: props.impact.interestPaidToDateWithoutExtra, done: "bg-gray-500 dark:bg-gray-400", todo: "bg-gray-300 dark:bg-gray-600", value: "text-gray-700 dark:text-gray-300" },
  { key: "with", label: "Interest with extra payments", total: props.impact.interestWithExtra, paid: props.impact.interestPaidToDate, done: "bg-green-600 dark:bg-green-400", todo: "bg-green-200 dark:bg-green-900", value: "font-medium text-green-700 dark:text-green-300" },
])
</script>

<template>
  <section class="grid gap-x-8 gap-y-4 px-6 py-4 lg:grid-cols-[auto_minmax(0,1fr)_minmax(0,1.3fr)] items-center bg-green-50/70 dark:bg-green-950/30 border-b border-green-100 dark:border-green-900" aria-label="Savings from extra payments">
    <div class="flex items-center gap-3">
      <span class="inline-flex items-center justify-center w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/60 text-green-700 dark:text-green-300 shrink-0" aria-hidden="true">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 17 13.5 8.5 8.5 13.5 2 7" /><polyline points="16 17 22 17 22 11" /></svg>
      </span>
      <div>
        <p class="text-xs text-gray-500 dark:text-gray-400">{{ heading ?? "Interest saved by extra payments" }}</p>
        <p class="text-2xl font-bold tabular-nums leading-tight text-green-700 dark:text-green-300">{{ money(impact.interestSaved) }}</p>
      </div>
    </div>

    <div class="text-sm text-gray-600 dark:text-gray-300 space-y-1.5">
      <p>
        <span class="font-medium tabular-nums text-gray-900 dark:text-gray-100">{{ money(impact.totalExtra) }}</span> paid extra in {{ impact.count }} {{ impact.count === 1 ? "payment" : "payments" }}<template v-if="perEuro > 0">:
        <span class="whitespace-nowrap">{{ money(perEuro) }} back per {{ money(1) }}</span></template>
      </p>
      <p v-if="sooner" class="inline-flex items-center gap-1.5 rounded-full bg-green-100 dark:bg-green-900/60 px-2.5 py-0.5 text-xs font-medium text-green-800 dark:text-green-200">
        Paid off {{ fmtMonths(impact.monthsSaved) }} sooner
      </p>
      <p v-else class="text-xs text-gray-500 dark:text-gray-400">The payment is lower instead; the end date stays.</p>
      <p class="text-xs text-gray-500 dark:text-gray-400">
        Last payment
        <span v-if="impact.endDate !== impact.endDateWithoutExtra" class="line-through opacity-70 tabular-nums">{{ fmtDate(impact.endDateWithoutExtra) }}</span>
        <span class="font-medium tabular-nums text-gray-800 dark:text-gray-100">{{ fmtDate(impact.endDate) }}</span>
      </p>
    </div>

    <div class="space-y-3">
      <div v-for="bar in bars" :key="bar.key">
        <div class="flex items-baseline justify-between gap-2 text-xs text-gray-500 dark:text-gray-400">
          <span>{{ bar.label }}</span>
          <span class="tabular-nums" :class="bar.value">{{ money(bar.total) }}</span>
        </div>
        <div
          class="mt-1 flex h-2.5 rounded-full overflow-hidden bg-gray-200/60 dark:bg-gray-700/50"
          role="img"
          :aria-label="`${bar.label}: ${money(bar.total)} in all, ${money(bar.paid)} paid so far`"
        >
          <div :class="bar.done" :style="{ width: pct(bar.paid) }" />
          <div :class="bar.todo" :style="{ width: pct(Math.max(0, bar.total - bar.paid)) }" />
        </div>
        <p class="mt-0.5 text-[11px] text-gray-400 dark:text-gray-500 tabular-nums">{{ money(bar.paid) }} paid so far · {{ money(Math.max(0, bar.total - bar.paid)) }} to go</p>
      </div>
    </div>
  </section>
</template>
