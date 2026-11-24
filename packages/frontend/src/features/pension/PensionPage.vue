<script setup lang="ts">
import { computed, ref } from "vue"
import { usePensionPlans } from "../../api"
import { Button, EmptyState, LoadingText } from "../../components/ui"
import { fmtSymbolCur } from "../../lib/format"
import SummaryTiles from "../portfolios/SummaryTiles.vue"
import AddPlanForm from "./AddPlanForm.vue"
import PlanCard from "./PlanCard.vue"

/** The Pensions screen: totals per currency, then the plans that still matter, then the closed ones. */
const { data, isLoading } = usePensionPlans()
const plans = computed(() => data.value ?? [])
const open = computed(() => plans.value.filter((p) => p.state !== "closed"))
const closed = computed(() => plans.value.filter((p) => p.state === "closed"))
const adding = ref(false)
const showClosed = ref(false)

const groups = computed(() => {
  const byCurrency = new Map<string, typeof plans.value>()
  for (const p of open.value) byCurrency.set(p.currency, [...(byCurrency.get(p.currency) ?? []), p])
  return [...byCurrency.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([currency, items]) => {
    const income = items.filter((p) => p.expectedIncome !== null)
    // today's euros and nominal euros do not add up: say so instead of mixing them silently
    const mixed = new Set(income.map((p) => p.incomeInTodaysMoney)).size > 1
    return {
      currency,
      mixed,
      tiles: [
        { label: "Pots (in net worth)", value: fmtSymbolCur(items.reduce((s, p) => s + p.netWorthValue, 0), currency), color: "text-green-600 dark:text-green-400" },
        { label: "Expected income at retirement", value: `${fmtSymbolCur(income.reduce((s, p) => s + (p.expectedIncome ?? 0), 0), currency)} / yr` },
      ],
    }
  })
})
</script>

<template>
  <LoadingText v-if="isLoading" />
  <div v-else class="space-y-6">
    <div class="flex items-center justify-between">
      <h1 class="text-2xl font-bold text-gray-900 dark:text-gray-100">Pensions</h1>
      <Button v-if="!adding" size="md" class="rounded-lg" @click="adding = true">+ New plan</Button>
    </div>

    <AddPlanForm v-if="adding" @done="adding = false" />

    <EmptyState v-if="plans.length === 0 && !adding" title="No pensions yet.">
      <p class="text-sm text-gray-400 dark:text-gray-500 mt-1">
        Add each plan (the state pension, an employer's scheme, a personal product), then the figures from its statement. A pot you own counts in your net worth; accrued rights and the state pension are shown as income.
      </p>
    </EmptyState>

    <template v-if="plans.length > 0">
      <section v-for="g in groups" :key="g.currency" :aria-label="`${g.currency} totals`">
        <p v-if="groups.length > 1" class="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">{{ g.currency }}</p>
        <SummaryTiles :tiles="g.tiles" />
        <p v-if="g.mixed" class="text-xs text-amber-600 dark:text-amber-400 -mt-2">The expected income adds figures in today's euros to nominal ones; treat it as a rough total.</p>
      </section>
      <div class="space-y-6"><PlanCard v-for="p in open" :key="p.id" :plan="p" :plans="plans" /></div>

      <section v-if="closed.length > 0" aria-label="Closed plans" class="space-y-4">
        <Button variant="muted-link" @click="showClosed = !showClosed">{{ showClosed ? "Hide" : "Show" }} closed plans ({{ closed.length }})</Button>
        <div v-if="showClosed" class="space-y-6"><PlanCard v-for="p in closed" :key="p.id" :plan="p" :plans="plans" /></div>
      </section>
    </template>
  </div>
</template>
