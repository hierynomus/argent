<script setup lang="ts">
import { computed, reactive, ref } from "vue"
import { useMutation } from "@tanstack/vue-query"
import { updateDebtPartSchema } from "@argent/shared"
import { debtApis, useInvalidate, type Debt, type DebtKind, type DebtPart } from "../../api"
import { Button, ConfirmButton, ErrorText, Field, FieldGroup, Input, SegmentedControl, Td } from "../../components/ui"
import { addMonths, monthsBetween } from "../../lib/dates"
import { fmtCur, fmtMonthYear, fmtRate } from "../../lib/format"
import { useFormErrors } from "../../lib/validate"
import ExtraPaymentsPanel from "./ExtraPaymentsPanel.vue"
import TypeBadge from "./TypeBadge.vue"

/** One part of a mortgage/loan as a table row, plus its optional edit row and extra-payments panel. */
const props = defineProps<{ kind: DebtKind; debt: Debt; part: DebtPart; canEdit: boolean }>()
const COLUMNS = 9

const invalidate = useInvalidate()
const { errors, check } = useFormErrors()
const showPayments = ref(false)
const editing = ref(false)
// rates are stored as a fraction (0.035) but edited as a percentage (3.5)
const form = reactive({
  name: props.part.name,
  annualInterestRate: (parseFloat(props.part.annualInterestRate) * 100).toFixed(4),
  rateType: props.part.rateType ?? "nominal",
  // the term is edited in months from the start date; the end date follows
  termMonths: String(props.part.firstPaymentDate ? monthsBetween(props.part.firstPaymentDate, props.part.endDate) + 1 : monthsBetween(props.part.startDate, props.part.endDate)),
})
const RATE_TYPES = [{ value: "nominal", label: "Nominal" }, { value: "effective", label: "Effective" }] as const
const body = () => ({ name: form.name, annualInterestRate: (parseFloat(form.annualInterestRate) / 100).toFixed(6), rateType: form.rateType, endDate: props.part.firstPaymentDate ? addMonths(props.part.firstPaymentDate, parseInt(form.termMonths, 10) - 1) : addMonths(props.part.startDate, parseInt(form.termMonths, 10)) })

const update = useMutation({
  mutationFn: () => debtApis[props.kind].updatePart(props.debt.id, props.part.id, body()),
  onSuccess: () => {
    invalidate.debts(props.kind)
    editing.value = false
  },
})
const remove = useMutation({
  mutationFn: () => debtApis[props.kind].removePart(props.debt.id, props.part.id),
  onSuccess: () => invalidate.debts(props.kind),
})

// an older backend does not send the projection: fall back to the scheduled end
const projectedEnd = computed(() => props.part.projectedEndDate ?? props.part.endDate)

// progress is measured against the projected term, which extra payments shorten
const progressPct = () => {
  const total = props.part.monthsElapsed + props.part.monthsRemaining
  return total === 0 ? 100 : Math.round((props.part.monthsElapsed / total) * 100)
}
</script>

<template>
  <tr class="hover:bg-gray-50 dark:hover:bg-gray-800/50">
    <td class="px-4 py-3 text-sm font-medium text-gray-900 dark:text-gray-100">{{ part.name }}</td>
    <Td><TypeBadge :type="part.type" /></Td>
    <td class="px-4 py-3 text-sm text-right tabular-nums text-gray-600 dark:text-gray-400">{{ fmtCur(parseFloat(part.principal), debt.currency) }}</td>
    <td class="px-4 py-3 text-sm text-right tabular-nums font-semibold text-gray-900 dark:text-gray-100">{{ fmtCur(part.currentBalance, debt.currency) }}</td>
    <td class="px-4 py-3 text-sm text-right tabular-nums text-gray-600 dark:text-gray-400">{{ fmtRate(part.annualInterestRate) }}<span v-if="part.rateType === 'effective'" class="ml-1 text-xs text-gray-400 dark:text-gray-500" title="Effective annual rate">eff.</span></td>
    <td class="px-4 py-3 text-sm text-right tabular-nums text-gray-900 dark:text-gray-100">
      <span class="font-medium">{{ fmtCur(part.monthlyPayment, debt.currency) }}</span>
      <span class="text-xs text-gray-400 dark:text-gray-500 ml-1">/mo</span>
    </td>
    <td class="px-4 py-3 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
      <span class="text-gray-400 dark:text-gray-500">{{ fmtMonthYear(part.startDate) }}</span>{{ " → " }}<span :title="projectedEnd !== part.endDate ? `Scheduled end: ${fmtMonthYear(part.endDate)}` : undefined">{{ fmtMonthYear(projectedEnd) }}</span>
    </td>
    <td class="px-4 py-3 w-32">
      <div class="flex items-center gap-2">
        <div class="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-1.5 overflow-hidden">
          <div class="h-full bg-indigo-500 rounded-full" :style="{ width: `${progressPct()}%` }" />
        </div>
        <span class="text-xs text-gray-400 dark:text-gray-500 whitespace-nowrap">{{ part.monthsRemaining }}mo</span>
      </div>
    </td>
    <Td align="right">
      <div class="flex items-center justify-end gap-2">
        <Button variant="link" size="xs" title="Extra payments" @click="showPayments = !showPayments">{{ showPayments ? "Hide" : "Payments" }}</Button>
        <template v-if="canEdit">
          <Button variant="muted-link" size="xs" @click="editing = !editing">Edit</Button>
          <!-- keyed on `editing` so opening the edit form also dismisses a pending delete confirmation -->
          <ConfirmButton :key="String(editing)" label="Delete" @start="editing = false" @confirm="remove.mutate()" />
        </template>
      </div>
    </Td>
  </tr>

  <tr v-if="editing && canEdit" class="bg-indigo-50 dark:bg-indigo-950/30">
    <Td :colspan="COLUMNS">
      <div class="flex gap-3 flex-wrap items-end">
        <Field label="Name" :error="errors.name"><Input v-model="form.name" density="sm" type="text" class="w-40" /></Field>
        <Field label="Rate (%)" :error="errors.annualInterestRate">
          <Input v-model="form.annualInterestRate" density="sm" type="number" min="0" step="0.001" class="w-24" />
        </Field>
        <FieldGroup label="Rate is"><SegmentedControl v-model="form.rateType" :options="RATE_TYPES" padding="px-2 py-1" /></FieldGroup>
        <Field label="Term (months)" :error="errors.endDate ? 'The term must be at least 1 month' : undefined"><Input v-model="form.termMonths" density="sm" type="number" min="1" step="1" class="w-28" /></Field>
        <Button :disabled="update.isPending.value" @click="check(updateDebtPartSchema, body()) && update.mutate()">Save</Button>
        <Button variant="secondary" @click="editing = false">Cancel</Button>
      </div>
      <ErrorText :error="update.error.value" />
    </Td>
  </tr>

  <tr v-if="showPayments">
    <td :colspan="COLUMNS" class="p-0">
      <ExtraPaymentsPanel :kind="kind" :debt="debt" :part="part" :can-edit="canEdit" />
    </td>
  </tr>
</template>
