<script setup lang="ts">
import { reactive } from "vue"
import { useMutation } from "@tanstack/vue-query"
import { updateAccountSchema, type Account } from "@argent/shared"
import { updateAccount, useInvalidate } from "../../api"
import { Button, ErrorText, Field, FieldGroup, Input, SegmentedControl, vFocus } from "../../components/ui"
import { fmtBalance } from "../../lib/format"
import { useFormErrors } from "../../lib/validate"

/** Edit form for one account: name, type, and the opening balance the computed balance starts from. */
const props = defineProps<{ account: Account }>()
const emit = defineEmits<{ done: [] }>()

const invalidate = useInvalidate()
const { errors, check } = useFormErrors()
const opening = parseFloat(props.account.openingBalance ?? "0")
const form = reactive({
  name: props.account.name ?? "",
  type: (props.account.type ?? "checking") as "checking" | "savings",
  openingBalance: opening !== 0 ? String(opening) : "",
  openingBalanceDate: props.account.openingBalanceDate ?? "",
})

const body = () => ({
  // a blank name clears it (the API treats "" as "no name")
  name: form.name,
  type: form.type,
  openingBalance: form.openingBalance || undefined,
  openingBalanceDate: form.openingBalanceDate || null,
})

const save = useMutation({
  mutationFn: () => updateAccount(props.account.id, body()),
  onSuccess: () => {
    invalidate.accounts()
    emit("done")
  },
})
const submit = () => check(updateAccountSchema, body()) && save.mutate()
</script>

<template>
  <div class="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800">
    <div class="flex flex-wrap gap-3 items-end">
      <Field label="Name" :error="errors.name"><Input v-model="form.name" v-focus density="sm" type="text" placeholder="Account name…" class="w-52" /></Field>
      <FieldGroup label="Type"><SegmentedControl v-model="form.type" :options="['checking', 'savings'] as const" padding="px-3 py-1 font-medium" capitalize /></FieldGroup>
      <Field :label="`Opening balance (${account.currency})`" :error="errors.openingBalance"><Input v-model="form.openingBalance" density="sm" type="number" step="0.01" placeholder="0.00" class="w-32" /></Field>
      <Field label="As of date" :error="errors.openingBalanceDate"><Input v-model="form.openingBalanceDate" density="sm" type="date" /></Field>
      <Button size="sm" class="!py-1" :disabled="save.isPending.value" @click="submit">Save</Button>
      <Button variant="muted-link" size="sm" class="!px-2 !py-1" @click="emit('done')">Cancel</Button>
    </div>
    <ErrorText :error="save.error.value" />
    <p v-if="account.openingBalanceDate" class="mt-2 text-xs text-gray-400 dark:text-gray-500">
      Balance calculated from {{ account.openingBalanceDate }}<template v-if="opening !== 0"> (opening: {{ fmtBalance(account.openingBalance, account.currency, "nl-NL") }})</template>
    </p>
  </div>
</template>
