<script setup lang="ts">
import { reactive } from "vue"
import { useMutation } from "@tanstack/vue-query"
import { createPropertyValuationSchema, type CreatePropertyValuationBody } from "@argent/shared"
import { propertiesApi, useInvalidate } from "../../api"
import { Button, ErrorText, Field, Input, vFocus } from "../../components/ui"
import { useFormErrors } from "../../lib/validate"

/** Records what the property is worth on a date (a WOZ value, an appraisal, your own estimate). */
const props = defineProps<{ propertyId: string; currency: string }>()
const emit = defineEmits<{ done: [] }>()
const invalidate = useInvalidate()
const { errors, check } = useFormErrors()
const form = reactive({ valuationDate: new Date().toISOString().slice(0, 10), value: "", note: "" })

const body = (): CreatePropertyValuationBody => ({ valuationDate: form.valuationDate, value: form.value, ...(form.note.trim() ? { note: form.note.trim() } : {}) })
const save = useMutation({
  mutationFn: () => propertiesApi.addValuation(props.propertyId, body()),
  onSuccess: () => {
    invalidate.properties()
    emit("done")
  },
})
const submit = () => check(createPropertyValuationSchema, body()) && save.mutate()
</script>

<template>
  <form class="flex flex-wrap gap-3 items-end mt-3" novalidate @submit.prevent="submit">
    <Field label="Date" :error="errors.valuationDate"><Input v-model="form.valuationDate" density="sm" type="date" class="w-36" /></Field>
    <Field :label="`Value (${currency})`" :error="errors.value"><Input v-model="form.value" v-focus density="sm" type="number" min="0" step="0.01" placeholder="520000" class="w-36" /></Field>
    <Field label="Note (optional)" :error="errors.note"><Input v-model="form.note" density="sm" type="text" placeholder="e.g. WOZ 2024" class="w-44" /></Field>
    <Button type="submit" size="sm" :disabled="!form.value || save.isPending.value">{{ save.isPending.value ? "Saving…" : "Save valuation" }}</Button>
    <Button variant="muted-link" size="sm" class="!px-2" @click="emit('done')">Cancel</Button>
    <ErrorText :error="save.error.value" />
  </form>
</template>
