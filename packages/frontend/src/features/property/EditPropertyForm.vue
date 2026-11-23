<script setup lang="ts">
import { reactive } from "vue"
import { useMutation } from "@tanstack/vue-query"
import { updatePropertySchema, type PropertyType, type PropertyWithDetails, type UpdatePropertyBody } from "@argent/shared"
import { propertiesApi, useInvalidate } from "../../api"
import { Button, ErrorText, Field, Input, Select, vFocus } from "../../components/ui"
import { useFormErrors } from "../../lib/validate"
import { PROPERTY_TYPE_OPTIONS } from "./config"

/** Rename a property, change its type, or set/clear what was paid for it. */
const props = defineProps<{ property: PropertyWithDetails }>()
const emit = defineEmits<{ done: [] }>()
const invalidate = useInvalidate()
const { errors, check } = useFormErrors()
const form = reactive({
  name: props.property.name,
  type: props.property.type as PropertyType,
  purchasePrice: props.property.purchasePrice ? String(parseFloat(props.property.purchasePrice)) : "",
  purchaseDate: props.property.purchaseDate ?? "",
})

// an emptied field clears the value (the API takes null for "not set")
const body = (): UpdatePropertyBody => ({
  name: form.name,
  type: form.type,
  purchasePrice: form.purchasePrice || null,
  purchaseDate: form.purchaseDate || null,
})
const save = useMutation({
  mutationFn: () => propertiesApi.update(props.property.id, body()),
  onSuccess: () => {
    invalidate.properties()
    emit("done")
  },
})
const submit = () => check(updatePropertySchema, body()) && save.mutate()
</script>

<template>
  <form class="flex flex-wrap gap-3 items-end pb-3 mb-3 border-b border-gray-100 dark:border-gray-800" novalidate @submit.prevent="submit">
    <Field label="Name" :error="errors.name"><Input v-model="form.name" v-focus density="sm" type="text" class="w-48" /></Field>
    <Field label="Type"><Select v-model="form.type" density="sm"><option v-for="o in PROPERTY_TYPE_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option></Select></Field>
    <Field label="Purchase price" :error="errors.purchasePrice"><Input v-model="form.purchasePrice" density="sm" type="number" min="0" step="0.01" class="w-32" /></Field>
    <Field label="Purchase date" :error="errors.purchaseDate"><Input v-model="form.purchaseDate" density="sm" type="date" class="w-36" /></Field>
    <Button type="submit" size="sm" :disabled="save.isPending.value">Save</Button>
    <Button variant="muted-link" size="sm" class="px-2!" @click="emit('done')">Cancel</Button>
    <ErrorText :error="save.error.value" />
  </form>
</template>
