<script setup lang="ts">
import { reactive } from "vue"
import { useMutation } from "@tanstack/vue-query"
import { createTransactionSchema, type Account, type Transaction } from "@argent/shared"
import { createTransaction, editTransaction, useCategories, useInvalidate } from "../../api"
import { Button, ErrorText, Field, FieldGroup, Input, SegmentedControl, Select, vFocus } from "../../components/ui"
import { useFormErrors } from "../../lib/validate"

/** Enter a transaction by hand (new) or correct one that was entered by hand (`tx`). */
const props = defineProps<{ account: Pick<Account, "id" | "currency">; tx?: Transaction }>()
const emit = defineEmits<{ done: [] }>()

const invalidate = useInvalidate()
const { data: categories } = useCategories()
const { errors, check } = useFormErrors()
const today = new Date().toISOString().slice(0, 10)
const form = reactive({
  bookingDate: props.tx?.bookingDate ?? today,
  direction: (props.tx?.creditDebitIndicator ?? "DBIT") as "CRDT" | "DBIT",
  amount: props.tx?.amount ?? "",
  description: props.tx?.description ?? "",
  counterpartyName: props.tx?.counterpartyName ?? "",
  categoryId: props.tx?.categoryId ?? "",
})

const body = () => ({
  accountId: props.account.id,
  bookingDate: form.bookingDate,
  direction: form.direction,
  amount: form.amount,
  description: form.description,
  counterpartyName: form.counterpartyName,
  categoryId: form.categoryId || null,
})

const save = useMutation({
  mutationFn: () => {
    const { accountId: _account, ...rest } = body()
    return props.tx ? editTransaction(props.tx.id, rest) : createTransaction(body())
  },
  onSuccess: () => {
    invalidate.afterManualEntry()
    emit("done")
  },
})
const submit = () => check(createTransactionSchema, body()) && save.mutate()
</script>

<template>
  <form novalidate class="flex flex-wrap gap-3 items-end" @submit.prevent="submit">
    <Field label="Date" :error="errors.bookingDate"><Input v-model="form.bookingDate" density="sm" type="date" /></Field>
    <FieldGroup label="Money">
      <SegmentedControl v-model="form.direction" :options="[{ value: 'DBIT', label: 'Out' }, { value: 'CRDT', label: 'In' }]" padding="px-3 py-1 font-medium" />
    </FieldGroup>
    <Field :label="`Amount (${account.currency})`" :error="errors.amount"><Input v-model="form.amount" v-focus density="sm" type="number" step="0.01" min="0" placeholder="0.00" class="w-28" /></Field>
    <Field label="Who / where" :error="errors.counterpartyName"><Input v-model="form.counterpartyName" density="sm" type="text" placeholder="Shop, person…" class="w-44" /></Field>
    <Field label="Description" :error="errors.description"><Input v-model="form.description" density="sm" type="text" placeholder="What was it for?" class="w-56" /></Field>
    <Field label="Label"><Select v-model="form.categoryId" density="sm"><option value="">Unlabeled</option><option v-for="c in categories ?? []" :key="c.id" :value="c.id">{{ c.name }}</option></Select></Field>
    <Button type="submit" size="sm" class="py-1!" :disabled="save.isPending.value">{{ tx ? "Save" : "Add transaction" }}</Button>
    <Button variant="muted-link" size="sm" class="px-2! py-1!" @click="emit('done')">Cancel</Button>
    <ErrorText class="basis-full" :error="save.error.value" />
  </form>
</template>
