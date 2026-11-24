<script setup lang="ts">
import { computed, ref } from "vue"
import { useMutation } from "@tanstack/vue-query"
import type { PensionPlanWithDetails } from "@argent/shared"
import { pensionsApi, useInvalidate } from "../../api"
import LineChart, { type ChartPoint } from "../../components/charts/LineChart.vue"
import { Badge, Button, ErrorText, Td, Th } from "../../components/ui"
import { fmtDate, fmtSymbolCur } from "../../lib/format"
import StatementForm from "./StatementForm.vue"

/** The statements of a plan, newest first, with the pot over time (a step line: flat until the next statement). */
const props = defineProps<{ plan: PensionPlanWithDetails }>()
const invalidate = useInvalidate()
const adding = ref(false)
const today = new Date().toISOString().slice(0, 10)
const at = (iso: string) => new Date(`${iso}T12:00:00`).getTime()

const points = computed<ChartPoint[]>(() => {
  const dated = props.plan.statements.filter((s) => s.capital !== null && s.statementDate <= today).map((s) => ({ t: at(s.statementDate), v: parseFloat(s.capital!) }))
  dated.sort((a, b) => a.t - b.t)
  const end = props.plan.closedOn && props.plan.closedOn < today ? props.plan.closedOn : today
  if (dated.length > 0 && dated[dated.length - 1].t < at(end)) dated.push({ t: at(end), v: dated[dated.length - 1].v })
  return dated
})
const rows = computed(() => [...props.plan.statements].reverse())
const remove = useMutation({ mutationFn: (id: string) => pensionsApi.removeStatement(props.plan.id, id), onSuccess: () => invalidate.pensions() })
const money = (n: number) => fmtSymbolCur(n, props.plan.currency)
const opt = (v: string | null) => (v === null ? "" : money(parseFloat(v)))
const day = (t: number) => fmtDate(new Date(t).toISOString().slice(0, 10))
const scenarios = (s: PensionPlanWithDetails["statements"][number]) =>
  s.projectedLow !== null || s.projectedHigh !== null ? `${opt(s.projectedLow) || "—"} / ${opt(s.projectedExpected) || "—"} / ${opt(s.projectedHigh) || "—"}` : opt(s.projectedExpected)
</script>

<template>
  <div>
    <div class="flex items-center justify-between mb-2">
      <h3 class="text-sm font-medium text-gray-700 dark:text-gray-300">Statements</h3>
      <Button v-if="plan.canEdit && !adding" variant="link" size="xs" @click="adding = true">+ Add statement</Button>
    </div>
    <LineChart v-if="points.length >= 2" :points="points" :format-value="money" :format-date="day" step :label="`${plan.name} pot over time`" />
    <StatementForm v-if="adding" :plan="plan" @done="adding = false" />
    <p v-if="rows.length === 0" class="text-sm text-gray-400 dark:text-gray-500 py-3">
      No statements yet.<template v-if="plan.canEdit"> Add the figures from your provider's statement (or mijnpensioenoverzicht.nl); the latest one counts.</template>
    </p>
    <div v-else class="overflow-x-auto">
      <table class="w-full text-sm mt-3 min-w-[640px]">
        <thead>
          <tr class="text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wide border-b border-gray-100 dark:border-gray-800">
            <Th align="left" dense>Date</Th><Th align="right" dense>Pot</Th><Th align="right" dense>Built up / yr</Th>
            <Th align="right" dense>At retirement / yr (low / expected / high)</Th><Th align="left" dense>Note</Th><Th dense><span class="sr-only">Actions</span></Th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-50 dark:divide-gray-800">
          <tr v-for="s in rows" :key="s.id">
            <td class="px-4 py-2 text-gray-600 dark:text-gray-400 whitespace-nowrap">{{ fmtDate(s.statementDate) }}</td>
            <Td dense align="right" mono tone="strong">{{ opt(s.capital) }}</Td>
            <Td dense align="right" mono>{{ opt(s.accruedIncome) }}</Td>
            <Td dense align="right" mono>{{ scenarios(s) }}<span v-if="scenarios(s) && !s.inTodaysMoney" class="text-xs text-gray-400"> nominal</span></Td>
            <td class="px-4 py-2 text-xs text-gray-500 dark:text-gray-400">
              {{ s.note ?? "" }}
              <Badge v-if="s.id === plan.latestStatement?.id" class="ml-1 bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300">current</Badge>
              <Badge v-else-if="s.statementDate > today" class="ml-1 bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400">upcoming</Badge>
            </td>
            <Td dense align="right">
              <Button v-if="plan.canEdit" variant="danger-link" size="xs" :disabled="remove.isPending.value" :aria-label="`Delete the statement of ${fmtDate(s.statementDate)}`" @click="remove.mutate(s.id)">Delete</Button>
            </Td>
          </tr>
        </tbody>
      </table>
    </div>
    <ErrorText :error="remove.error.value" />
  </div>
</template>
