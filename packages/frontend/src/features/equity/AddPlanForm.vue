<script setup lang="ts">
import { reactive } from "vue"
import { useMutation } from "@tanstack/vue-query"
import { createEquityPlanSchema, type CreateEquityPlanBody } from "@argent/shared"
import { equityApi, useInvalidate } from "../../api"
import { Button, Card, ErrorText, Field, FieldGroup, Input, SegmentedControl, vFocus } from "../../components/ui"
import { useFormErrors } from "../../lib/validate"

/** A plan holds the grants from one company. Add the grants and share prices afterwards. */
const emit = defineEmits<{ done: [] }>()
const invalidate = useInvalidate()
const { errors, check } = useFormErrors()
const form = reactive({ name: "", currency: "EUR" as "EUR" | "USD" })
const body = (): CreateEquityPlanBody => ({ name: form.name, currency: form.currency })
const create = useMutation({
  mutationFn: () => equityApi.create(body()),
  onSuccess: () => {
    invalidate.equity()
    emit("done")
  },
})
const submit = () => check(createEquityPlanSchema, body()) && create.mutate()
</script>

<template>
  <Card class="p-5">
    <form class="space-y-4" novalidate @submit.prevent="submit">
      <p class="text-sm font-medium text-gray-700 dark:text-gray-300">New company</p>
      <div class="flex flex-wrap gap-3 items-end">
        <Field label="Company" :error="errors.name"><Input v-model="form.name" v-focus type="text" placeholder="e.g. Acme BV" class="w-56" /></Field>
        <FieldGroup label="Currency"><SegmentedControl v-model="form.currency" :options="['EUR', 'USD'] as const" padding="px-3 py-1.5 font-medium" /></FieldGroup>
        <Button type="submit" class="rounded-md" :disabled="!form.name.trim() || create.isPending.value">{{ create.isPending.value ? "Adding…" : "Add company" }}</Button>
        <Button variant="muted-link" size="sm" class="px-2!" @click="emit('done')">Cancel</Button>
      </div>
      <ErrorText :error="create.error.value" />
    </form>
  </Card>
</template>
