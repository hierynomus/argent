<script setup lang="ts">
import { reactive } from "vue"
import { useMutation } from "@tanstack/vue-query"
import { createAccountSchema, type Account } from "@argent/shared"
import { createAccount, useInvalidate } from "../../api"
import { Button, ErrorText, Field, FieldGroup, Input, SegmentedControl, vFocus } from "../../components/ui"
import { useFormErrors } from "../../lib/validate"

/** Add an account by hand: a bank that offers no export, or cash in the house. */
const props = defineProps<{ type: Account["type"] }>()
const emit = defineEmits<{ done: [] }>()

const invalidate = useInvalidate()
const { errors, check } = useFormErrors()
const form = reactive({ name: "", currency: "EUR" as "EUR" | "USD", iban: "", openingBalance: "", openingBalanceDate: "" })

const body = () => ({
  name: form.name,
  type: props.type,
  currency: form.currency,
  iban: props.type === "cash" ? undefined : form.iban || undefined,
  openingBalance: form.openingBalance || undefined,
  openingBalanceDate: form.openingBalanceDate || null,
})

const save = useMutation({
  mutationFn: () => createAccount(body()),
  onSuccess: () => {
    invalidate.afterManualEntry()
    emit("done")
  },
})
const submit = () => check(createAccountSchema, body()) && save.mutate()
</script>

<template>
  <form novalidate class="flex flex-wrap gap-3 items-end" @submit.prevent="submit">
    <Field label="Name" :error="errors.name"><Input v-model="form.name" v-focus density="sm" type="text" :placeholder="type === 'cash' ? 'Wallet, home safe…' : 'Account name…'" class="w-52" /></Field>
    <FieldGroup label="Currency"><SegmentedControl v-model="form.currency" :options="['EUR', 'USD'] as const" padding="px-3 py-1 font-medium" /></FieldGroup>
    <Field v-if="type !== 'cash'" label="IBAN (optional)" :error="errors.iban"><Input v-model="form.iban" density="sm" type="text" placeholder="Only if you have one" class="w-56 font-mono" /></Field>
    <Field :label="`Balance (${form.currency})`" :error="errors.openingBalance"><Input v-model="form.openingBalance" density="sm" type="number" step="0.01" placeholder="0.00" class="w-32" /></Field>
    <Field label="As of date" :error="errors.openingBalanceDate"><Input v-model="form.openingBalanceDate" density="sm" type="date" /></Field>
    <Button type="submit" size="sm" class="py-1!" :disabled="save.isPending.value">Add account</Button>
    <Button variant="muted-link" size="sm" class="px-2! py-1!" @click="emit('done')">Cancel</Button>
    <ErrorText class="basis-full" :error="save.error.value" />
  </form>
</template>
