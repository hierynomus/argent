<script setup lang="ts">
import { reactive } from "vue"
import { useMutation } from "@tanstack/vue-query"
import { createPensionStatementSchema, type CreatePensionStatementBody, type PensionPlanWithDetails } from "@argent/shared"
import { pensionsApi, useInvalidate } from "../../api"
import { Button, ErrorText, Field, Input, vFocus } from "../../components/ui"
import { useFormErrors } from "../../lib/validate"

/**
 * Enter what a provider's statement says. Fill in what the statement has: the pot (capital), the yearly income
 * built up so far, and the projection at retirement (one figure, or the three scenarios of the new pension system).
 */
const props = defineProps<{ plan: PensionPlanWithDetails }>()
const emit = defineEmits<{ done: [] }>()
const invalidate = useInvalidate()
const { errors, check } = useFormErrors()
const form = reactive({
  statementDate: new Date().toISOString().slice(0, 10),
  capital: "", accruedIncome: "", projectedLow: "", projectedExpected: "", projectedHigh: "", partnerIncome: "", note: "",
  inTodaysMoney: props.plan.incomeInTodaysMoney,
})
const FIELDS = ["capital", "accruedIncome", "projectedLow", "projectedExpected", "projectedHigh", "partnerIncome"] as const
const body = (): CreatePensionStatementBody => ({
  statementDate: form.statementDate,
  ...Object.fromEntries(FIELDS.filter((f) => form[f].trim() !== "").map((f) => [f, form[f].trim()])),
  inTodaysMoney: form.inTodaysMoney,
  ...(form.note.trim() ? { note: form.note.trim() } : {}),
})
const save = useMutation({
  mutationFn: () => pensionsApi.addStatement(props.plan.id, body()),
  onSuccess: () => {
    invalidate.pensions()
    emit("done")
  },
})
const submit = () => check(createPensionStatementSchema, body()) && save.mutate()
const empty = () => FIELDS.every((f) => form[f].trim() === "")
</script>

<template>
  <form class="space-y-3 my-3" novalidate @submit.prevent="submit">
    <div class="flex flex-wrap gap-3 items-end">
      <Field label="Statement date" :error="errors.statementDate"><Input v-model="form.statementDate" density="sm" type="date" class="w-36" /></Field>
      <Field :label="`Pot / capital (${plan.currency})`" :error="errors.capital"><Input v-model="form.capital" v-focus density="sm" type="number" min="0" step="any" placeholder="e.g. 42000" class="w-36" /></Field>
      <Field label="Income built up, per year" :error="errors.accruedIncome"><Input v-model="form.accruedIncome" density="sm" type="number" min="0" step="any" placeholder="e.g. 8000" class="w-36" /></Field>
      <Field label="Partner pension, per year" :error="errors.partnerIncome"><Input v-model="form.partnerIncome" density="sm" type="number" min="0" step="any" class="w-36" /></Field>
    </div>
    <div class="flex flex-wrap gap-3 items-end">
      <Field label="At retirement, per year: low" :error="errors.projectedLow"><Input v-model="form.projectedLow" density="sm" type="number" min="0" step="any" class="w-36" /></Field>
      <Field label="Expected" :error="errors.projectedExpected"><Input v-model="form.projectedExpected" density="sm" type="number" min="0" step="any" class="w-36" /></Field>
      <Field label="High" :error="errors.projectedHigh"><Input v-model="form.projectedHigh" density="sm" type="number" min="0" step="any" class="w-36" /></Field>
      <Field label="Note (optional)" :error="errors.note"><Input v-model="form.note" density="sm" type="text" placeholder="e.g. annual statement" class="w-48" /></Field>
    </div>
    <label class="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
      <input v-model="form.inTodaysMoney" type="checkbox" class="w-4 h-4 accent-indigo-600" /> The yearly figures are in today's euros (not nominal)
    </label>
    <div class="flex gap-3 items-center">
      <Button type="submit" size="sm" :disabled="empty() || save.isPending.value">{{ save.isPending.value ? "Saving…" : "Save statement" }}</Button>
      <Button variant="muted-link" size="sm" class="px-2!" @click="emit('done')">Cancel</Button>
    </div>
    <p v-if="errors.capital && empty()" class="sr-only">{{ errors.capital }}</p>
    <ErrorText :error="save.error.value" />
  </form>
</template>
