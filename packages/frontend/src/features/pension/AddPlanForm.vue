<script setup lang="ts">
import { reactive } from "vue"
import { useMutation } from "@tanstack/vue-query"
import { createPensionPlanSchema, type CreatePensionPlanBody, type PensionKind } from "@argent/shared"
import { pensionsApi, useInvalidate } from "../../api"
import { Button, Card, ErrorText, Field, FieldGroup, Input, SegmentedControl, Select, vFocus } from "../../components/ui"
import { useFormErrors } from "../../lib/validate"
import { KIND_OPTIONS } from "./labels"

/** A plan is one pension arrangement. Add its statements afterwards. */
const emit = defineEmits<{ done: [] }>()
const invalidate = useInvalidate()
const { errors, check } = useFormErrors()
const form = reactive({ name: "", provider: "", kind: "occupational_dc" as PensionKind, currency: "EUR" as "EUR" | "USD", frozen: false, retirementDate: "" })
const body = (): CreatePensionPlanBody => ({
  name: form.name,
  kind: form.kind,
  currency: form.currency,
  ...(form.provider.trim() ? { provider: form.provider.trim() } : {}),
  ...(form.frozen ? { status: "frozen" as const } : {}),
  ...(form.retirementDate ? { retirementDate: form.retirementDate } : {}),
})
const create = useMutation({
  mutationFn: () => pensionsApi.create(body()),
  onSuccess: () => {
    invalidate.pensions()
    emit("done")
  },
})
const submit = () => check(createPensionPlanSchema, body()) && create.mutate()
</script>

<template>
  <Card class="p-5">
    <form class="space-y-4" novalidate @submit.prevent="submit">
      <p class="text-sm font-medium text-gray-700 dark:text-gray-300">New pension plan</p>
      <div class="flex flex-wrap gap-3 items-end">
        <Field label="Name" :error="errors.name"><Input v-model="form.name" v-focus type="text" placeholder="e.g. Employer pension" class="w-56" /></Field>
        <Field label="Provider (optional)" :error="errors.provider"><Input v-model="form.provider" type="text" placeholder="e.g. the fund" class="w-48" /></Field>
        <Field label="Type" :error="errors.kind">
          <Select v-model="form.kind"><option v-for="o in KIND_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option></Select>
        </Field>
        <FieldGroup label="Currency"><SegmentedControl v-model="form.currency" :options="['EUR', 'USD'] as const" padding="px-3 py-1.5 font-medium" /></FieldGroup>
        <Field label="Retirement date (optional)" :error="errors.retirementDate"><Input v-model="form.retirementDate" type="date" class="w-40" /></Field>
      </div>
      <label class="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
        <input v-model="form.frozen" type="checkbox" class="w-4 h-4 accent-indigo-600" /> Frozen: nothing is added to it any more (an old employer's plan)
      </label>
      <div class="flex gap-3 items-center">
        <Button type="submit" class="rounded-md" :disabled="!form.name.trim() || create.isPending.value">{{ create.isPending.value ? "Adding…" : "Add plan" }}</Button>
        <Button variant="muted-link" size="sm" class="px-2!" @click="emit('done')">Cancel</Button>
      </div>
      <ErrorText :error="create.error.value" />
    </form>
  </Card>
</template>
