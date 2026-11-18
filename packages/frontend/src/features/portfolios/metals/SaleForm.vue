<script setup lang="ts">
import { reactive } from "vue"
import { useMutation } from "@tanstack/vue-query"
import { createMetalSaleSchema, type MetalLot } from "@argent/shared"
import { metalsApi, useInvalidate } from "../../../api"
import { Button, ErrorText, Field, Input } from "../../../components/ui"
import { useFormErrors } from "../../../lib/validate"

/** Inline form (inside the lots table) to record selling some pieces of one lot. */
const props = defineProps<{ portfolioId: string; lot: MetalLot; currency: string }>()
const emit = defineEmits<{ done: [] }>()

const invalidate = useInvalidate()
const { errors, check } = useFormErrors()
const form = reactive({ saleDate: "", quantitySold: "1", totalReceived: "", notes: "" })

const body = () => ({ saleDate: form.saleDate, quantitySold: parseInt(form.quantitySold, 10), totalReceived: form.totalReceived, notes: form.notes.trim() || undefined })

const save = useMutation({
  mutationFn: () => metalsApi.addSale(props.portfolioId, props.lot.id, body()),
  onSuccess: () => {
    invalidate.portfolios("metals")
    emit("done")
  },
})

function submit() {
  if (check(createMetalSaleSchema, body())) save.mutate()
}
</script>

<template>
  <form class="flex flex-wrap gap-3 items-end" @submit.prevent="submit">
    <Field :label="`Qty to sell (max ${lot.remainingQuantity})`" :error="errors.quantitySold">
      <Input v-model="form.quantitySold" required type="number" min="1" :max="lot.remainingQuantity" step="1" class="w-24" />
    </Field>
    <Field :label="`Total received (${currency})`" :error="errors.totalReceived">
      <Input v-model="form.totalReceived" required type="number" step="any" min="0" placeholder="0.00" class="w-32" />
    </Field>
    <Field label="Sale date" :error="errors.saleDate"><Input v-model="form.saleDate" required type="date" /></Field>
    <Field label="Notes"><Input v-model="form.notes" placeholder="Optional" class="w-32" /></Field>
    <Button type="submit" size="sm" class="rounded-lg bg-red-600 hover:bg-red-700" :disabled="save.isPending.value">{{ save.isPending.value ? "Saving…" : "Record sale" }}</Button>
    <ErrorText :error="save.error.value" />
  </form>
</template>
