<script setup lang="ts">
import { computed } from "vue"
import { fmtCur } from "../../lib/format"
import type { Repaid } from "./repaid"

/**
 * How much of the loan has been repaid so far: the share as the headline, and one bar with what came from the
 * regular installments (dark), from extra payments (green) and what is still owed (light).
 */
const props = defineProps<{ repaid: Repaid; currency: string }>()

const money = (n: number) => fmtCur(n, props.currency)
const pct = (n: number) => `${Math.min(100, Math.max(0, (n / props.repaid.original) * 100))}%`
const regular = computed(() => Math.max(0, props.repaid.repaid - props.repaid.extra))
const shown = computed(() => (props.repaid.percent >= 10 || props.repaid.percent === 0 ? props.repaid.percent.toFixed(0) : props.repaid.percent.toFixed(1)))
</script>

<template>
  <section class="grid gap-x-8 gap-y-3 px-6 py-4 lg:grid-cols-[auto_minmax(0,1fr)] items-center bg-indigo-50/60 dark:bg-indigo-950/30 border-b border-indigo-100 dark:border-indigo-900" aria-label="Repaid so far">
    <div class="flex items-center gap-3">
      <span class="inline-flex items-center justify-center w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 shrink-0" aria-hidden="true">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.1V12a10 10 0 1 1-5.9-9.1" /><polyline points="22 4 12 14.01 9 11.01" /></svg>
      </span>
      <div>
        <p class="text-xs text-gray-500 dark:text-gray-400">Repaid so far</p>
        <p class="text-2xl font-bold tabular-nums leading-tight text-indigo-700 dark:text-indigo-300">{{ money(repaid.repaid) }}<span class="ml-2 text-sm font-semibold text-indigo-500 dark:text-indigo-400">{{ shown }}%</span></p>
      </div>
    </div>

    <div>
      <div class="flex flex-wrap items-baseline justify-between gap-x-4 text-xs text-gray-500 dark:text-gray-400">
        <span>of <span class="tabular-nums text-gray-700 dark:text-gray-300">{{ money(repaid.original) }}</span> borrowed</span>
        <span><span class="tabular-nums font-medium text-gray-800 dark:text-gray-100">{{ money(repaid.left) }}</span> left</span>
      </div>
      <div
        class="mt-1 flex h-2.5 rounded-full overflow-hidden bg-gray-200/70 dark:bg-gray-700/50"
        role="img"
        :aria-label="`${shown}% repaid: ${money(regular)} in installments, ${money(repaid.extra)} in extra payments, ${money(repaid.left)} left`"
      >
        <div class="bg-indigo-600 dark:bg-indigo-400" :style="{ width: pct(regular) }" />
        <div class="bg-green-500 dark:bg-green-400" :style="{ width: pct(repaid.extra) }" />
      </div>
      <p class="mt-1 text-[11px] text-gray-400 dark:text-gray-500 tabular-nums">
        <span class="inline-block w-2 h-2 rounded-full bg-indigo-600 dark:bg-indigo-400 align-baseline mr-1" />{{ money(regular) }} in installments
        <template v-if="repaid.extra > 0"><span class="inline-block w-2 h-2 rounded-full bg-green-500 dark:bg-green-400 align-baseline ml-3 mr-1" />{{ money(repaid.extra) }} in extra payments</template>
      </p>
    </div>
  </section>
</template>
