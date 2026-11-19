<script setup lang="ts">
import { ref } from "vue"
import { useMutation } from "@tanstack/vue-query"
import type { EquityPlanWithDetails } from "@argent/shared"
import { equityApi, useInvalidate } from "../../api"
import { Badge, Button, ConfirmButton, ErrorText, Td, Th } from "../../components/ui"
import { fmtDate, fmtMaxDecimals, fmtSymbolCur } from "../../lib/format"
import GrantForm from "./GrantForm.vue"

/** The grants of a plan: how much of each has vested, when more vests, and what that is worth. */
const props = defineProps<{ plan: EquityPlanWithDetails }>()
const invalidate = useInvalidate()
const adding = ref(false)
const editingId = ref<string | null>(null)

const remove = useMutation({ mutationFn: (id: string) => equityApi.removeGrant(props.plan.id, id), onSuccess: () => invalidate.equity() })
const pct = (vested: number, options: number) => (options === 0 ? 0 : Math.round((vested / options) * 100))
const money = (n: number | null) => (n === null ? "—" : fmtSymbolCur(n, props.plan.currency))
const label = (g: { label: string | null; grantDate: string }) => g.label ?? `Grant of ${fmtDate(g.grantDate)}`
</script>

<template>
  <div>
    <div class="flex items-center justify-between mb-2">
      <h3 class="text-sm font-medium text-gray-700 dark:text-gray-300">Grants</h3>
      <Button v-if="plan.canEdit && !adding" variant="link" size="xs" @click="adding = true">+ Add grant</Button>
    </div>
    <GrantForm v-if="adding" :plan-id="plan.id" @done="adding = false" />

    <p v-if="plan.grants.length === 0" class="text-sm text-gray-400 dark:text-gray-500 py-3">No grants yet.<template v-if="plan.canEdit"> Add each grant you received; a plan that vests partly over time and partly on exit is two grants.</template></p>
    <div v-else class="overflow-x-auto">
      <table class="w-full text-sm min-w-[720px]">
        <thead>
          <tr class="text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wide border-b border-gray-100 dark:border-gray-800">
            <Th align="left" dense>Grant</Th>
            <Th align="right" dense>Options</Th>
            <Th align="right" dense>Strike</Th>
            <Th align="left" dense>Vesting</Th>
            <Th align="left" dense>Next</Th>
            <Th align="right" dense>Value</Th>
            <Th dense><span class="sr-only">Actions</span></Th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-50 dark:divide-gray-800">
          <template v-for="g in plan.grants" :key="g.id">
            <tr>
              <Td dense tone="strong">
                {{ label(g) }}
                <Badge class="ml-1 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">{{ g.vestingType === "time" ? "over time" : "on exit" }}</Badge>
              </Td>
              <Td dense align="right" mono tone="strong">{{ fmtMaxDecimals(parseFloat(g.options), 2) }}</Td>
              <Td dense align="right" mono tone="muted">{{ fmtMaxDecimals(parseFloat(g.strikePrice), 6) }}</Td>
              <td class="px-4 py-2 w-48">
                <template v-if="g.vestingType === 'time'">
                  <div class="flex items-center gap-2">
                    <div class="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-1.5 overflow-hidden"><div class="h-full bg-indigo-500 rounded-full" :style="{ width: `${pct(g.vested, parseFloat(g.options))}%` }" /></div>
                    <span class="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">{{ fmtMaxDecimals(g.vested, 2) }} vested</span>
                  </div>
                  <div class="text-[11px] text-gray-400 dark:text-gray-500">{{ g.cliffMonths }} mo cliff · {{ g.vestMonths }} mo</div>
                </template>
                <span v-else class="text-xs text-gray-500 dark:text-gray-400">pays out on an exit</span>
              </td>
              <td class="px-4 py-2 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">{{ g.nextVestingDate ? fmtDate(g.nextVestingDate) : g.vestingType === "time" ? "fully vested" : "—" }}</td>
              <Td dense align="right" mono tone="strong">
                {{ money(g.vestingType === "time" ? g.vestedValue : g.onExitValue) }}
                <div class="text-[11px] text-gray-400 dark:text-gray-500">{{ g.vestingType === "time" ? "vested" : "if exit today" }}</div>
              </Td>
              <td class="px-4 py-2 text-right whitespace-nowrap">
                <template v-if="plan.canEdit">
                  <Button variant="link" size="xs" :aria-label="`Edit ${label(g)}`" @click="editingId = editingId === g.id ? null : g.id">Edit</Button>
                  <ConfirmButton class="ml-2" label="Delete" :prompt="`Delete ${label(g)}?`" @confirm="remove.mutate(g.id)" />
                </template>
              </td>
            </tr>
            <tr v-if="editingId === g.id">
              <td colspan="7" class="px-4 pt-3 bg-gray-50 dark:bg-gray-800/30"><GrantForm :plan-id="plan.id" :grant="g" @done="editingId = null" /></td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>
    <ErrorText :error="remove.error.value" />
  </div>
</template>
