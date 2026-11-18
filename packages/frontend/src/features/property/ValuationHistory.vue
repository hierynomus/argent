<script setup lang="ts">
import { computed, ref } from "vue"
import { useMutation } from "@tanstack/vue-query"
import type { PropertyWithDetails } from "@argent/shared"
import { propertiesApi, useInvalidate } from "../../api"
import LineChart, { type ChartPoint } from "../../components/charts/LineChart.vue"
import { Badge, Button, ErrorText, Th } from "../../components/ui"
import { fmtCur, fmtDate } from "../../lib/format"
import ValuationForm from "./ValuationForm.vue"

/**
 * The valuations of a property as a chart (a step line: the value stays flat until the next valuation) and
 * a table, with the form to add one. The line is carried on to today with the current value.
 */
const props = defineProps<{ property: PropertyWithDetails }>()
const invalidate = useInvalidate()
const adding = ref(false)
const today = new Date().toISOString().slice(0, 10)
const at = (iso: string) => new Date(`${iso}T12:00:00`).getTime()

const points = computed<ChartPoint[]>(() => {
  const p = props.property
  const dated = p.valuations.filter((v) => v.valuationDate <= today).map((v) => ({ t: at(v.valuationDate), v: parseFloat(v.value) }))
  // the purchase is where the story starts, unless a valuation is dated even earlier
  if (p.purchasePrice && p.purchaseDate && p.purchaseDate <= today && !p.valuations.some((v) => v.valuationDate <= p.purchaseDate!)) {
    dated.unshift({ t: at(p.purchaseDate), v: parseFloat(p.purchasePrice) })
  }
  dated.sort((a, b) => a.t - b.t)
  // flat up to today
  if (dated.length > 0 && dated[dated.length - 1].t < at(today)) dated.push({ t: at(today), v: dated[dated.length - 1].v })
  return dated
})

const rows = computed(() => [...props.property.valuations].reverse()) // newest first
const remove = useMutation({
  mutationFn: (valuationId: string) => propertiesApi.removeValuation(props.property.id, valuationId),
  onSuccess: () => invalidate.properties(),
})
const money = (n: number) => fmtCur(n, props.property.currency)
const day = (t: number) => fmtDate(new Date(t).toISOString().slice(0, 10))
</script>

<template>
  <div>
    <div class="flex items-center justify-between mb-2">
      <h3 class="text-sm font-medium text-gray-700 dark:text-gray-300">Valuations</h3>
      <Button v-if="property.canEdit && !adding" variant="link" size="xs" @click="adding = true">+ Add valuation</Button>
    </div>

    <LineChart v-if="points.length >= 2" :points="points" :format-value="money" :format-date="day" step :label="`${property.name} value over time`" />

    <ValuationForm v-if="adding" :property-id="property.id" :currency="property.currency" @done="adding = false" />

    <p v-if="rows.length === 0" class="text-sm text-gray-400 dark:text-gray-500 py-3">
      No valuations yet.<template v-if="property.canEdit"> Add what it is worth (a WOZ value, an appraisal or your own estimate); the latest one counts.</template>
    </p>
    <table v-else class="w-full text-sm mt-3">
      <thead>
        <tr class="text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wide border-b border-gray-100 dark:border-gray-800">
          <Th align="left" dense>Date</Th>
          <Th align="right" dense>Value</Th>
          <Th align="left" dense>Note</Th>
          <Th dense><span class="sr-only">Actions</span></Th>
        </tr>
      </thead>
      <tbody class="divide-y divide-gray-50 dark:divide-gray-800">
        <tr v-for="v in rows" :key="v.id">
          <td class="px-4 py-2 text-gray-600 dark:text-gray-400 whitespace-nowrap">{{ fmtDate(v.valuationDate) }}</td>
          <td class="px-4 py-2 text-right font-mono text-gray-900 dark:text-gray-100">{{ money(parseFloat(v.value)) }}</td>
          <td class="px-4 py-2 text-xs text-gray-500 dark:text-gray-400">
            {{ v.note ?? "" }}
            <Badge v-if="v.valuationDate === property.currentValueDate && v.valuationDate <= today" class="ml-1 bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300">current</Badge>
            <Badge v-else-if="v.valuationDate > today" class="ml-1 bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400">upcoming</Badge>
          </td>
          <td class="px-4 py-2 text-right">
            <Button v-if="property.canEdit" variant="danger-link" size="xs" :disabled="remove.isPending.value" :aria-label="`Delete the valuation of ${fmtDate(v.valuationDate)}`" @click="remove.mutate(v.id)">Delete</Button>
          </td>
        </tr>
      </tbody>
    </table>
    <ErrorText :error="remove.error.value" />
  </div>
</template>
