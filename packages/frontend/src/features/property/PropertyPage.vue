<script setup lang="ts">
import { computed, ref } from "vue"
import { useProperties } from "../../api"
import { Button, EmptyState, LoadingText } from "../../components/ui"
import { fmtSymbolCur } from "../../lib/format"
import SummaryTiles from "../portfolios/SummaryTiles.vue"
import AddPropertyForm from "./AddPropertyForm.vue"
import PropertyCard from "./PropertyCard.vue"

/** The Property screen: totals per currency, then one card per property. */
const { data, isLoading } = useProperties()
const properties = computed(() => data.value ?? [])
const adding = ref(false)

const groups = computed(() => {
  const byCurrency = new Map<string, typeof properties.value>()
  for (const p of properties.value) byCurrency.set(p.currency, [...(byCurrency.get(p.currency) ?? []), p])
  return [...byCurrency.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([currency, items]) => {
    const value = items.reduce((s, p) => s + (p.currentValue ?? 0), 0)
    const debt = items.reduce((s, p) => s + p.debt, 0)
    return {
      currency,
      tiles: [
        { label: "Worth", value: fmtSymbolCur(value, currency) },
        { label: "Owed", value: fmtSymbolCur(debt, currency) },
        { label: "Equity", value: fmtSymbolCur(value - debt, currency), color: value - debt >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400" },
      ],
    }
  })
})
</script>

<template>
  <LoadingText v-if="isLoading" />
  <div v-else class="space-y-6">
    <div class="flex items-center justify-between">
      <h1 class="text-2xl font-bold text-gray-900 dark:text-gray-100">Property</h1>
      <Button v-if="!adding" size="md" class="rounded-lg" @click="adding = true">+ New property</Button>
    </div>

    <AddPropertyForm v-if="adding" @done="adding = false" />

    <EmptyState v-if="properties.length === 0 && !adding" title="No property yet.">
      <p class="text-sm text-gray-400 dark:text-gray-500 mt-1">Add your house (or a car, or a share in a business) with what it is worth, and link the mortgage that finances it: its value then counts in your net worth.</p>
    </EmptyState>

    <template v-if="properties.length > 0">
      <section v-for="g in groups" :key="g.currency" :aria-label="`${g.currency} totals`">
        <p v-if="groups.length > 1" class="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">{{ g.currency }}</p>
        <SummaryTiles :tiles="g.tiles" />
      </section>
      <div class="space-y-6"><PropertyCard v-for="p in properties" :key="p.id" :property="p" /></div>
    </template>
  </div>
</template>
