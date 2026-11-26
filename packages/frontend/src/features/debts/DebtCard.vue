<script setup lang="ts">
import { computed, ref } from "vue"
import { useMutation } from "@tanstack/vue-query"
import { debtApis, useInvalidate, type Debt, type DebtKind } from "../../api"
import SharingPanel from "../../components/SharingPanel.vue"
import { Button, Card, ConfirmButton } from "../../components/ui"
import { fmtCur } from "../../lib/format"
import AddPartForm from "./AddPartForm.vue"
import { DEBT_KINDS } from "./config"
import { sumImpacts } from "./extraSavings"
import PartRow from "./PartRow.vue"

/** One mortgage/loan: totals, its parts, sharing (owner only) and add/delete actions. */
const props = defineProps<{ kind: DebtKind; debt: Debt }>()

const HEADERS: Array<{ label: string; align: "left" | "right"; srOnly?: boolean }> = [
  { label: "Name", align: "left" },
  { label: "Type", align: "left" },
  { label: "Original", align: "right" },
  { label: "Balance", align: "right" },
  { label: "Rate", align: "right" },
  { label: "Monthly", align: "right" },
  { label: "Term", align: "left" },
  { label: "Progress", align: "left" },
  { label: "Actions", align: "left", srOnly: true }, // the column of edit/delete buttons has no visible title
]

const noun = DEBT_KINDS[props.kind].noun
const invalidate = useInvalidate()
const showAddPart = ref(false)
const showAccess = ref(false)

const remove = useMutation({ mutationFn: () => debtApis[props.kind].remove(props.debt.id), onSuccess: () => invalidate.debts(props.kind) })
const savings = computed(() => sumImpacts(props.debt.parts.map((p) => p.extraImpact)))
const refresh = () => invalidate.debts(props.kind)
</script>

<template>
  <Card size="xl" class="overflow-hidden">
    <div class="px-6 py-5 border-b border-gray-100 dark:border-gray-800 flex items-start justify-between gap-4">
      <div>
        <p class="text-lg font-semibold text-gray-900 dark:text-gray-100">{{ debt.name }}</p>
        <div class="flex items-center gap-2 mt-0.5">
          <p class="text-xs text-gray-400 dark:text-gray-500">{{ debt.currency }}</p>
          <span v-if="!debt.isOwner" class="text-xs px-1.5 py-0.5 rounded-sm bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">
            {{ debt.canEdit ? "editor" : "viewer" }}
          </span>
        </div>
      </div>
      <div class="text-right shrink-0">
        <p class="text-2xl font-bold text-gray-900 dark:text-gray-100">{{ fmtCur(debt.totalCurrentBalance, debt.currency) }}</p>
        <p class="text-sm text-gray-500 dark:text-gray-400">{{ fmtCur(debt.totalMonthlyPayment, debt.currency) }}<span class="text-xs">/mo</span></p>
      </div>
    </div>

    <div v-if="savings" class="px-6 py-3 flex flex-wrap items-center gap-x-8 gap-y-2 bg-green-50/70 dark:bg-green-950/30 border-b border-green-100 dark:border-green-900" aria-label="Savings from extra payments">
      <span class="inline-flex items-center justify-center w-9 h-9 rounded-full bg-green-100 dark:bg-green-900/60 text-green-700 dark:text-green-300 shrink-0" aria-hidden="true">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 17 13.5 8.5 8.5 13.5 2 7" /><polyline points="16 17 22 17 22 11" /></svg>
      </span>
      <div>
        <p class="text-xs text-gray-500 dark:text-gray-400">Interest saved by extra payments</p>
        <p class="text-xl font-bold tabular-nums leading-tight text-green-700 dark:text-green-300">{{ fmtCur(savings.interestSaved, debt.currency) }}</p>
      </div>
      <div>
        <p class="text-xs text-gray-500 dark:text-gray-400">Paid extra</p>
        <p class="text-sm font-semibold tabular-nums text-gray-900 dark:text-gray-100">{{ fmtCur(savings.totalExtra, debt.currency) }}<span class="ml-1.5 text-xs font-normal text-gray-400 dark:text-gray-500">in {{ savings.count }} {{ savings.count === 1 ? "payment" : "payments" }}</span></p>
      </div>
      <p class="text-xs text-gray-400 dark:text-gray-500 sm:ml-auto">compared with paying as scheduled</p>
    </div>

    <div v-if="debt.parts.length > 0" class="overflow-x-auto">
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b border-gray-100 dark:border-gray-800">
            <th
              v-for="(h, i) in HEADERS"
              :key="i"
              class="px-4 py-2 text-xs font-medium text-gray-500 dark:text-gray-400"
              :class="h.align === 'right' ? 'text-right' : 'text-left'"
            >
              <span :class="h.srOnly && 'sr-only'">{{ h.label }}</span>
            </th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-50 dark:divide-gray-800/50">
          <PartRow v-for="part in debt.parts" :key="part.id" :kind="kind" :debt="debt" :part="part" :can-edit="debt.canEdit" />
        </tbody>
      </table>
    </div>

    <div v-if="debt.isOwner && showAccess" class="px-6 py-4 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/30">
      <SharingPanel
        :members="debt.members"
        :add-member="(m) => debtApis[kind].addMember(debt.id, m).then(refresh)"
        :remove-member="(group) => debtApis[kind].removeMember(debt.id, group).then(refresh)"
      />
    </div>

    <AddPartForm v-if="showAddPart" :kind="kind" :debt="debt" @done="showAddPart = false" />
    <div v-else class="px-6 py-3 flex items-center justify-between border-t border-gray-100 dark:border-gray-800 flex-wrap gap-2">
      <div class="flex items-center gap-3">
        <Button v-if="debt.canEdit" variant="link" @click="showAddPart = true">+ Add part</Button>
        <Button v-if="debt.isOwner" variant="muted-link" @click="showAccess = !showAccess">{{ showAccess ? "Hide access" : "Share" }}</Button>
      </div>
      <div v-if="debt.isOwner" class="flex items-center gap-3">
        <ConfirmButton :label="`Delete ${noun}`" :prompt="`Delete ${noun}?`" @confirm="remove.mutate()" />
      </div>
    </div>
  </Card>
</template>
