<script setup lang="ts">
import { reactive } from "vue"
import { useMutation } from "@tanstack/vue-query"
import { createDebtPartSchema } from "@argent/shared"
import { debtApis, useInvalidate, type Debt, type DebtKind, type DebtPart } from "../../api"
import { Button, ErrorText, Field, FieldGroup, Input, SegmentedControl } from "../../components/ui"
import { useFormErrors } from "../../lib/validate"
import { DEBT_KINDS, PART_TYPE_LABELS } from "./config"

type PartType = DebtPart["type"]

/** Form to add a part (a loan tranche with its own rate, term and repayment type). */
const props = defineProps<{ kind: DebtKind; debt: Debt }>()
const emit = defineEmits<{ done: [] }>()

const TYPE_OPTIONS = (Object.keys(PART_TYPE_LABELS) as PartType[]).map((value) => ({ value, label: PART_TYPE_LABELS[value] }))
const invalidate = useInvalidate()
const { errors, check } = useFormErrors()
const hints = DEBT_KINDS[props.kind].part
const form = reactive({ name: "", type: "annuity" as PartType, principal: "", annualInterestRate: "", startDate: "", endDate: "" })

// the rate is entered as a percentage but sent as a fraction
const body = () => ({
  name: form.name,
  type: form.type,
  principal: form.principal,
  annualInterestRate: (parseFloat(form.annualInterestRate) / 100).toFixed(6),
  startDate: form.startDate,
  endDate: form.endDate,
})

const add = useMutation({
  mutationFn: () => debtApis[props.kind].addPart(props.debt.id, body()),
  onSuccess: () => {
    invalidate.debts(props.kind)
    emit("done")
  },
})
const complete = () => !!(form.name && form.principal && form.annualInterestRate && form.startDate && form.endDate)
</script>

<template>
  <div class="border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/30 px-6 py-4">
    <p class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Add part</p>
    <div class="flex flex-wrap gap-3 items-end">
      <Field label="Name" :error="errors.name"><Input v-model="form.name" type="text" :placeholder="hints.namePlaceholder" class="w-36" /></Field>
      <FieldGroup label="Type"><SegmentedControl v-model="form.type" :options="TYPE_OPTIONS" padding="px-2 py-1.5" /></FieldGroup>
      <Field :label="`Principal (${debt.currency})`" :error="errors.principal">
        <Input v-model="form.principal" type="number" min="0" :step="hints.principalStep" :placeholder="hints.principalPlaceholder" class="w-32" />
      </Field>
      <Field label="Rate (%/yr)" :error="errors.annualInterestRate">
        <Input v-model="form.annualInterestRate" type="number" min="0" step="0.001" :placeholder="hints.ratePlaceholder" class="w-24" />
      </Field>
      <Field label="Start date" :error="errors.startDate"><Input v-model="form.startDate" type="date" class="w-36" /></Field>
      <Field label="End date" :error="errors.endDate"><Input v-model="form.endDate" type="date" class="w-36" /></Field>
      <Button :disabled="!complete() || add.isPending.value" @click="check(createDebtPartSchema, body()) && add.mutate()">
        {{ add.isPending.value ? "Adding…" : "Add part" }}
      </Button>
      <Button variant="secondary" @click="emit('done')">Cancel</Button>
    </div>
    <ErrorText :error="add.error.value" />
  </div>
</template>
