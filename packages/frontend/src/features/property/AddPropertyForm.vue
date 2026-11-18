<script setup lang="ts">
import { reactive } from "vue"
import { useMutation } from "@tanstack/vue-query"
import { createPropertySchema, type CreatePropertyBody, type PropertyType } from "@argent/shared"
import { propertiesApi, useInvalidate } from "../../api"
import { Button, Card, ErrorText, Field, FieldGroup, Input, SegmentedControl, Select, vFocus } from "../../components/ui"
import { useFormErrors } from "../../lib/validate"
import { PROPERTY_TYPE_OPTIONS } from "./config"

/** New property: what it is, optionally what was paid for it and what it is worth today (recorded as a first valuation). */
const emit = defineEmits<{ done: [] }>()
const invalidate = useInvalidate()
const { errors, check } = useFormErrors()
const form = reactive({ name: "", type: "house" as PropertyType, currency: "EUR" as "EUR" | "USD", purchasePrice: "", purchaseDate: "", currentValue: "" })

const body = (): CreatePropertyBody => ({
  name: form.name,
  type: form.type,
  currency: form.currency,
  ...(form.purchasePrice ? { purchasePrice: form.purchasePrice } : {}),
  ...(form.purchaseDate ? { purchaseDate: form.purchaseDate } : {}),
  ...(form.currentValue ? { currentValue: form.currentValue } : {}),
})

const create = useMutation({
  mutationFn: () => propertiesApi.create(body()),
  onSuccess: () => {
    invalidate.properties()
    emit("done")
  },
})
const submit = () => check(createPropertySchema, body()) && create.mutate()
</script>

<template>
  <Card class="p-5">
    <!-- novalidate: the shared zod schema validates (and explains), not the browser's own number checks -->
    <form class="space-y-4" novalidate @submit.prevent="submit">
      <p class="text-sm font-medium text-gray-700 dark:text-gray-300">New property</p>
      <div class="flex flex-wrap gap-3 items-end">
        <Field label="Name" :error="errors.name"><Input v-model="form.name" v-focus type="text" placeholder="e.g. Our house" class="w-52" /></Field>
        <Field label="Type"><Select v-model="form.type"><option v-for="o in PROPERTY_TYPE_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option></Select></Field>
        <FieldGroup label="Currency"><SegmentedControl v-model="form.currency" :options="['EUR', 'USD'] as const" padding="px-3 py-1.5 font-medium" /></FieldGroup>
      </div>
      <div class="flex flex-wrap gap-3 items-end">
        <Field label="Purchase price (optional)" :error="errors.purchasePrice"><Input v-model="form.purchasePrice" type="number" min="0" step="0.01" placeholder="400000" class="w-36" /></Field>
        <Field label="Purchase date (optional)" :error="errors.purchaseDate"><Input v-model="form.purchaseDate" type="date" class="w-40" /></Field>
        <Field label="Worth today (optional)" :error="errors.currentValue"><Input v-model="form.currentValue" type="number" min="0" step="0.01" placeholder="520000" class="w-36" /></Field>
      </div>
      <div class="flex gap-2">
        <Button type="submit" class="rounded-md" :disabled="!form.name.trim() || create.isPending.value">{{ create.isPending.value ? "Adding…" : "Add property" }}</Button>
        <Button variant="muted-link" size="sm" class="!px-2" @click="emit('done')">Cancel</Button>
      </div>
      <ErrorText :error="create.error.value" />
    </form>
  </Card>
</template>
