<script setup lang="ts">
import { computed, ref } from "vue"
import { useMutation } from "@tanstack/vue-query"
import type { EquityPlanWithDetails } from "@argent/shared"
import { equityApi, useInvalidate } from "../../api"
import LineChart, { type ChartPoint } from "../../components/charts/LineChart.vue"
import { Badge, Button, ErrorText, Th } from "../../components/ui"
import { fmtDate, fmtPrice } from "../../lib/format"
import PriceForm from "./PriceForm.vue"

/** The share price over time: a step line (flat until the next price, carried on to today) and a table. */
const props = defineProps<{ plan: EquityPlanWithDetails }>()
const invalidate = useInvalidate()
const adding = ref(false)
const today = new Date().toISOString().slice(0, 10)
const at = (iso: string) => new Date(`${iso}T12:00:00`).getTime()

const points = computed<ChartPoint[]>(() => {
  const dated = props.plan.prices.filter((p) => p.priceDate <= today).map((p) => ({ t: at(p.priceDate), v: parseFloat(p.price) }))
  dated.sort((a, b) => a.t - b.t)
  if (dated.length > 0 && dated[dated.length - 1].t < at(today)) dated.push({ t: at(today), v: dated[dated.length - 1].v })
  return dated
})
const rows = computed(() => [...props.plan.prices].reverse())
const remove = useMutation({ mutationFn: (id: string) => equityApi.removePrice(props.plan.id, id), onSuccess: () => invalidate.equity() })
const money = (n: number) => fmtPrice(n, props.plan.currency)
const day = (t: number) => fmtDate(new Date(t).toISOString().slice(0, 10))
</script>

<template>
  <div>
    <div class="flex items-center justify-between mb-2">
      <h3 class="text-sm font-medium text-gray-700 dark:text-gray-300">Share price</h3>
      <Button v-if="plan.canEdit && !adding" variant="link" size="xs" @click="adding = true">+ Add price</Button>
    </div>
    <LineChart v-if="points.length >= 2" :points="points" :format-value="money" :format-date="day" step :label="`${plan.name} share price over time`" />
    <PriceForm v-if="adding" :plan-id="plan.id" :currency="plan.currency" @done="adding = false" />
    <p v-if="rows.length === 0" class="text-sm text-gray-400 dark:text-gray-500 py-3">
      No share price yet, so the options cannot be valued.<template v-if="plan.canEdit"> Add the price from the latest funding round or valuation; the latest one counts.</template>
    </p>
    <table v-else class="w-full text-sm mt-3">
      <thead>
        <tr class="text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wide border-b border-gray-100 dark:border-gray-800">
          <Th align="left" dense>Date</Th><Th align="right" dense>Price</Th><Th align="left" dense>Note</Th><Th dense><span class="sr-only">Actions</span></Th>
        </tr>
      </thead>
      <tbody class="divide-y divide-gray-50 dark:divide-gray-800">
        <tr v-for="p in rows" :key="p.id">
          <td class="px-4 py-2 text-gray-600 dark:text-gray-400 whitespace-nowrap">{{ fmtDate(p.priceDate) }}</td>
          <td class="px-4 py-2 text-right font-mono text-gray-900 dark:text-gray-100">{{ money(parseFloat(p.price)) }}</td>
          <td class="px-4 py-2 text-xs text-gray-500 dark:text-gray-400">
            {{ p.note ?? "" }}
            <Badge v-if="p.priceDate === plan.currentPriceDate && p.priceDate <= today" class="ml-1 bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300">current</Badge>
            <Badge v-else-if="p.priceDate > today" class="ml-1 bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400">upcoming</Badge>
          </td>
          <td class="px-4 py-2 text-right">
            <Button v-if="plan.canEdit" variant="danger-link" size="xs" :disabled="remove.isPending.value" :aria-label="`Delete the price of ${fmtDate(p.priceDate)}`" @click="remove.mutate(p.id)">Delete</Button>
          </td>
        </tr>
      </tbody>
    </table>
    <ErrorText :error="remove.error.value" />
  </div>
</template>
