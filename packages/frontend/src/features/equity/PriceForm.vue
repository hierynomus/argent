<script setup lang="ts">
import { reactive } from "vue"
import { useMutation } from "@tanstack/vue-query"
import { createEquityPriceSchema, type CreateEquityPriceBody } from "@argent/shared"
import { equityApi, useInvalidate } from "../../api"
import { Button, ErrorText, Field, Input, vFocus } from "../../components/ui"
import { useFormErrors } from "../../lib/validate"

/** Records what a share/option base is worth on a date (a funding round, a valuation). */
const props = defineProps<{ planId: string; currency: string }>()
const emit = defineEmits<{ done: [] }>()
const invalidate = useInvalidate()
const { errors, check } = useFormErrors()
const form = reactive({ priceDate: new Date().toISOString().slice(0, 10), price: "", note: "" })
const body = (): CreateEquityPriceBody => ({ priceDate: form.priceDate, price: form.price, ...(form.note.trim() ? { note: form.note.trim() } : {}) })
const save = useMutation({
  mutationFn: () => equityApi.addPrice(props.planId, body()),
  onSuccess: () => {
    invalidate.equity()
    emit("done")
  },
})
const submit = () => check(createEquityPriceSchema, body()) && save.mutate()
</script>

<template>
  <form class="flex flex-wrap gap-3 items-end mt-3" novalidate @submit.prevent="submit">
    <Field label="Date" :error="errors.priceDate"><Input v-model="form.priceDate" density="sm" type="date" class="w-36" /></Field>
    <Field :label="`Price per share (${currency})`" :error="errors.price"><Input v-model="form.price" v-focus density="sm" type="number" min="0" step="any" placeholder="12.00" class="w-36" /></Field>
    <Field label="Note (optional)" :error="errors.note"><Input v-model="form.note" density="sm" type="text" placeholder="e.g. Series A round" class="w-48" /></Field>
    <Button type="submit" size="sm" :disabled="!form.price || save.isPending.value">{{ save.isPending.value ? "Saving…" : "Save price" }}</Button>
    <Button variant="muted-link" size="sm" class="!px-2" @click="emit('done')">Cancel</Button>
    <ErrorText :error="save.error.value" />
  </form>
</template>
