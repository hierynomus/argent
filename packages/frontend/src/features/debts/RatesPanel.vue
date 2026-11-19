<script setup lang="ts">
import { reactive } from "vue"
import { useMutation } from "@tanstack/vue-query"
import { createDebtRateSchema } from "@argent/shared"
import { debtApis, useInvalidate, type Debt, type DebtKind, type DebtPart } from "../../api"
import { Button, ErrorText, Field, FieldGroup, Input, SegmentedControl } from "../../components/ui"
import { fmtDate, fmtRate } from "../../lib/format"
import { useFormErrors } from "../../lib/validate"

/**
 * The rate of one part over time: the rate it started with, and the rate changes after it (each one the end
 * of a fixed-rate period), with a form to add the next. A change dated in the future is an assumption: the
 * part is projected with it, which shows what the payment becomes.
 */
const props = defineProps<{ kind: DebtKind; debt: Debt; part: DebtPart; canEdit: boolean }>()

const invalidate = useInvalidate()
const { errors, check } = useFormErrors()
const RATE_TYPES = [{ value: "nominal", label: "Nominal" }, { value: "effective", label: "Effective" }] as const
const form = reactive({ effectiveDate: "", rate: "", rateType: "nominal" as DebtPart["rateType"] })
// the rate is entered as a percentage but sent as a fraction
const body = () => ({ effectiveDate: form.effectiveDate, annualInterestRate: (parseFloat(form.rate) / 100).toFixed(6), rateType: form.rateType })
const today = new Date().toISOString().slice(0, 10)

const add = useMutation({
  mutationFn: () => debtApis[props.kind].addRate(props.debt.id, props.part.id, body()),
  onSuccess: () => {
    invalidate.debts(props.kind)
    Object.assign(form, { effectiveDate: "", rate: "" })
  },
})
const remove = useMutation({
  mutationFn: (rateId: string) => debtApis[props.kind].removeRate(props.debt.id, props.part.id, rateId),
  onSuccess: () => invalidate.debts(props.kind),
})
</script>

<template>
  <div class="px-4 py-3 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-100 dark:border-gray-800">
    <p class="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-2">Interest rate over time</p>

    <table class="w-full text-sm mb-3">
      <tbody class="divide-y divide-gray-100 dark:divide-gray-700">
        <tr>
          <td class="py-1.5 pr-4 text-gray-500 dark:text-gray-400 w-28 whitespace-nowrap">{{ fmtDate(part.startDate) }}</td>
          <td class="py-1.5 pr-4 font-medium text-gray-800 dark:text-gray-200 tabular-nums">{{ fmtRate(part.annualInterestRate) }}<span v-if="part.rateType === 'effective'" class="ml-1 text-xs text-gray-400">eff.</span></td>
          <td class="py-1.5 text-xs text-gray-500 dark:text-gray-400" :colspan="canEdit ? 2 : 1">Start (the rate of the part)</td>
        </tr>
        <tr v-for="r in part.rates ?? []" :key="r.id">
          <td class="py-1.5 pr-4 text-gray-500 dark:text-gray-400 whitespace-nowrap">{{ fmtDate(r.effectiveDate) }}</td>
          <td class="py-1.5 pr-4 font-medium text-gray-800 dark:text-gray-200 tabular-nums">{{ fmtRate(r.annualInterestRate) }}<span v-if="r.rateType === 'effective'" class="ml-1 text-xs text-gray-400">eff.</span></td>
          <td class="py-1.5 text-xs text-gray-500 dark:text-gray-400">{{ r.effectiveDate > today ? "Expected: the payment below assumes this rate" : "In effect" }}</td>
          <td v-if="canEdit" class="py-1.5 text-right"><Button variant="danger-link" size="xs" @click="remove.mutate(r.id)">Remove</Button></td>
        </tr>
      </tbody>
    </table>

    <div v-if="canEdit" class="flex gap-2 flex-wrap items-end">
      <Field label="New rate from" :error="errors.effectiveDate"><Input v-model="form.effectiveDate" density="sm" type="date" class="w-36" /></Field>
      <Field label="Rate (%/yr)" :error="errors.annualInterestRate"><Input v-model="form.rate" density="sm" type="number" min="0" step="0.001" placeholder="e.g. 4.10" class="w-28" /></Field>
      <FieldGroup label="Rate is"><SegmentedControl v-model="form.rateType" :options="RATE_TYPES" padding="px-2 py-1" /></FieldGroup>
      <Button :disabled="!form.effectiveDate || !form.rate || add.isPending.value" @click="check(createDebtRateSchema, body()) && add.mutate()">Add</Button>
    </div>
    <p v-if="canEdit" class="text-xs text-gray-400 dark:text-gray-500 mt-2">
      Enter the date the fixed-rate period ends. An annuity's payment is recalculated then, over the months left. A future rate is an assumption until the bank confirms it.
    </p>
    <ErrorText :error="add.error.value ?? remove.error.value" />
  </div>
</template>
