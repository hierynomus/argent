<script setup lang="ts">
import { reactive, ref } from "vue"
import { useMutation } from "@tanstack/vue-query"
import { updatePensionPlanSchema, type PensionPlanWithDetails } from "@argent/shared"
import { pensionsApi, useInvalidate } from "../../api"
import { Badge, Button, Card, ErrorText, Field, Input, vFocus } from "../../components/ui"
import { fmtDate, fmtSymbolCur } from "../../lib/format"
import { useFormErrors } from "../../lib/validate"
import { KIND_LABEL, STATE_CLASS, STATE_LABEL } from "./labels"
import PlanActions from "./PlanActions.vue"
import PlanControls from "./PlanControls.vue"
import StatementHistory from "./StatementHistory.vue"

/** One plan: what it is worth or promises today, its statements, and the transfers into and out of it. */
const props = defineProps<{ plan: PensionPlanWithDetails; plans: PensionPlanWithDetails[] }>()
const invalidate = useInvalidate()
const renaming = ref(false)
const { errors, check } = useFormErrors()
const form = reactive({ name: props.plan.name })
const rename = useMutation({
  mutationFn: () => pensionsApi.update(props.plan.id, { name: form.name }),
  onSuccess: () => {
    invalidate.pensions()
    renaming.value = false
  },
})
const submitRename = () => check(updatePensionPlanSchema, { name: form.name }) && rename.mutate()
const removeTransfer = useMutation({ mutationFn: (id: string) => pensionsApi.removeTransfer(id), onSuccess: () => invalidate.pensions() })

const money = (n: number | null) => (n === null ? "—" : fmtSymbolCur(n, props.plan.currency))
const yearly = (n: number | null) => (n === null ? "—" : `${fmtSymbolCur(n, props.plan.currency)} / yr`)
const range = () => (props.plan.incomeLow !== null && props.plan.incomeHigh !== null ? `${money(props.plan.incomeLow)} – ${money(props.plan.incomeHigh)}` : null)
const direction = (t: PensionPlanWithDetails["transfers"][number]) => (t.toPlanId === props.plan.id ? "in" : "out")
</script>

<template>
  <Card class="overflow-hidden" :class="plan.state === 'closed' ? 'opacity-80' : ''" :aria-label="plan.name" role="region">
    <div class="px-6 py-5">
      <div class="flex items-start justify-between gap-4 flex-wrap mb-4">
        <div>
          <h2 class="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {{ plan.name }}
            <Badge class="ml-2 align-middle" :class="STATE_CLASS[plan.state]">{{ STATE_LABEL[plan.state] }}</Badge>
          </h2>
          <p class="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
            {{ KIND_LABEL[plan.kind] }}<template v-if="plan.provider"> · {{ plan.provider }}</template
            ><template v-if="plan.closedOn"> · closed {{ fmtDate(plan.closedOn) }}</template
            ><template v-if="plan.retirementDate"> · retirement {{ fmtDate(plan.retirementDate) }}</template>
          </p>
        </div>
        <Button v-if="plan.canEdit" variant="link" size="xs" @click="renaming = !renaming">{{ renaming ? "Close" : "Rename" }}</Button>
      </div>
      <form v-if="renaming" class="flex gap-3 items-end pb-3 mb-3 border-b border-gray-100 dark:border-gray-800" novalidate @submit.prevent="submitRename">
        <Field label="Name" :error="errors.name"><Input v-model="form.name" v-focus density="sm" type="text" class="w-56" /></Field>
        <Button type="submit" size="sm" :disabled="rename.isPending.value">Save</Button>
        <ErrorText :error="rename.error.value" />
      </form>

      <dl class="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div>
          <dt class="text-xs text-gray-400 dark:text-gray-500">Pot</dt>
          <dd class="text-xl font-bold text-gray-900 dark:text-gray-100 tabular-nums">{{ money(plan.capital) }}</dd>
          <dd class="text-xs text-gray-400 dark:text-gray-500">
            {{ plan.latestStatement ? `as of ${fmtDate(plan.latestStatement.statementDate)}` : "no statement yet" }}
            <template v-if="plan.capital !== null"> · {{ plan.netWorthValue > 0 ? "counts in net worth" : "not counted" }}</template>
          </dd>
        </div>
        <div>
          <dt class="text-xs text-gray-400 dark:text-gray-500">Built up so far</dt>
          <dd class="text-xl font-bold text-gray-900 dark:text-gray-100 tabular-nums">{{ yearly(plan.accruedIncome) }}</dd>
          <dd class="text-xs text-gray-400 dark:text-gray-500">from retirement · not counted</dd>
        </div>
        <div>
          <dt class="text-xs text-gray-400 dark:text-gray-500">Expected at retirement</dt>
          <dd class="text-xl font-bold text-gray-900 dark:text-gray-100 tabular-nums">{{ yearly(plan.expectedIncome) }}</dd>
          <dd class="text-xs text-gray-400 dark:text-gray-500">{{ range() ?? "one scenario" }}<template v-if="plan.expectedIncome !== null"> · {{ plan.incomeInTodaysMoney ? "today's euros" : "nominal" }}</template></dd>
        </div>
        <div>
          <dt class="text-xs text-gray-400 dark:text-gray-500">Partner pension</dt>
          <dd class="text-xl font-bold text-gray-900 dark:text-gray-100 tabular-nums">{{ yearly(plan.partnerIncome) }}</dd>
        </div>
      </dl>
      <p class="text-xs text-gray-400 dark:text-gray-500 mt-3">Figures are before tax and come from the statements you enter. Only a pot you own counts in net worth; rights and the state pension are income, not savings.</p>

      <div v-if="plan.transfers.length > 0" class="mt-5">
        <h3 class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Transfers</h3>
        <ul class="text-sm space-y-1">
          <li v-for="t in plan.transfers" :key="t.id" class="flex flex-wrap items-baseline gap-x-2 text-gray-600 dark:text-gray-400">
            <span class="tabular-nums text-gray-500">{{ fmtDate(t.transferDate) }}</span>
            <span>
              {{ t.kind === "conversion" ? "Converted" : "Transferred" }}
              {{ direction(t) === "in" ? "from" : "to" }}
              <strong class="font-medium text-gray-800 dark:text-gray-200">{{ (direction(t) === "in" ? t.fromPlanName : t.toPlanName) ?? "another plan" }}</strong>
            </span>
            <span v-if="t.capital" class="tabular-nums">{{ money(parseFloat(t.capital)) }}</span>
            <span v-if="t.incomeGivenUp" class="tabular-nums text-xs text-gray-400">({{ yearly(parseFloat(t.incomeGivenUp)) }} given up)</span>
            <span v-if="t.note" class="text-xs text-gray-400">{{ t.note }}</span>
            <Button v-if="plan.canEdit" variant="danger-link" size="xs" :disabled="removeTransfer.isPending.value" :aria-label="`Delete the transfer of ${fmtDate(t.transferDate)}`" @click="removeTransfer.mutate(t.id)">Delete</Button>
          </li>
        </ul>
        <ErrorText :error="removeTransfer.error.value" />
      </div>

      <div class="mt-5"><StatementHistory :plan="plan" /></div>
      <PlanControls :plan="plan" :plans="plans" />
      <PlanActions v-if="plan.isOwner" :plan="plan" />
    </div>
  </Card>
</template>
