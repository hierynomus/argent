<script setup lang="ts">
import { computed, ref } from "vue"
import { useEquityPlans } from "../../api"
import { Button, EmptyState, LoadingText } from "../../components/ui"
import { fmtSymbolCur } from "../../lib/format"
import SummaryTiles from "../portfolios/SummaryTiles.vue"
import AddPlanForm from "./AddPlanForm.vue"
import PlanCard from "./PlanCard.vue"

/** The Options screen (stock options and similar): totals per currency, then one card per company. */
const { data, isLoading } = useEquityPlans()
const plans = computed(() => data.value ?? [])
const adding = ref(false)

const groups = computed(() => {
  const byCurrency = new Map<string, typeof plans.value>()
  for (const p of plans.value) byCurrency.set(p.currency, [...(byCurrency.get(p.currency) ?? []), p])
  return [...byCurrency.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([currency, items]) => {
    const total = (pick: (p: (typeof plans.value)[number]) => number | null) => items.reduce((s, p) => s + (pick(p) ?? 0), 0)
    return {
      currency,
      tiles: [
        { label: "Vested (in net worth)", value: fmtSymbolCur(total((p) => p.totals.vestedValue), currency), color: "text-green-600 dark:text-green-400" },
        { label: "Still vesting", value: fmtSymbolCur(total((p) => p.totals.unvestedValue), currency) },
        { label: "On exit", value: fmtSymbolCur(total((p) => p.totals.onExitValue), currency) },
      ],
    }
  })
})
</script>

<template>
  <LoadingText v-if="isLoading" />
  <div v-else class="space-y-6">
    <div class="flex items-center justify-between">
      <h1 class="text-2xl font-bold text-gray-900 dark:text-gray-100">Stock options</h1>
      <Button v-if="!adding" size="md" class="rounded-lg" @click="adding = true">+ New company</Button>
    </div>

    <AddPlanForm v-if="adding" @done="adding = false" />

    <EmptyState v-if="plans.length === 0 && !adding" title="No options yet.">
      <p class="text-sm text-gray-400 dark:text-gray-500 mt-1">Add the company, then your grants (over time or on exit) and the latest share price. Only the vested value counts in your net worth.</p>
    </EmptyState>

    <template v-if="plans.length > 0">
      <section v-for="g in groups" :key="g.currency" :aria-label="`${g.currency} totals`">
        <p v-if="groups.length > 1" class="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">{{ g.currency }}</p>
        <SummaryTiles :tiles="g.tiles" />
      </section>
      <div class="space-y-6"><PlanCard v-for="p in plans" :key="p.id" :plan="p" /></div>
    </template>
  </div>
</template>
