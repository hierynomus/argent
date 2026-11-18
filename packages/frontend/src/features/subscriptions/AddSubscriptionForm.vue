<script setup lang="ts">
import { ref } from "vue"
import { useMutation } from "@tanstack/vue-query"
import { createSubscriptionSchema, type Account } from "@argent/shared"
import { createSubscription, useInvalidate } from "../../api"
import { Button, ErrorText, Field, Input, Select, vFocus } from "../../components/ui"
import { useFormErrors } from "../../lib/validate"

/** Manually track a subscription: pick the account and the counterparty's IBAN; existing payments are linked automatically. */
const props = defineProps<{ accounts: Account[] }>()
const emit = defineEmits<{ done: [] }>()

const invalidate = useInvalidate()
const { errors, check } = useFormErrors()
const accountId = ref(props.accounts[0]?.id ?? "")
const counterpartyIban = ref("")
const name = ref("")

const body = () => ({ accountId: accountId.value, counterpartyIban: counterpartyIban.value.trim(), name: name.value.trim() || undefined })

const create = useMutation({
  mutationFn: () => createSubscription(body()),
  onSuccess: () => {
    invalidate.subscriptions()
    emit("done")
  },
})

function submit() {
  if (check(createSubscriptionSchema, body())) create.mutate()
}
</script>

<template>
  <form class="border border-indigo-200 dark:border-indigo-800 rounded-lg bg-indigo-50 dark:bg-indigo-950/30 px-5 py-4" @submit.prevent="submit">
    <div class="flex flex-wrap gap-3 items-end">
      <Field label="Account" :error="errors.accountId">
        <Select v-model="accountId"><option v-for="a in accounts" :key="a.id" :value="a.id">{{ a.name ?? a.iban }}</option></Select>
      </Field>
      <Field label="Counterparty IBAN" :error="errors.counterpartyIban">
        <Input v-model="counterpartyIban" v-focus type="text" placeholder="NL00BANK0123456789" class="w-52 font-mono" required />
      </Field>
      <Field label="Label (optional)"><Input v-model="name" type="text" placeholder="e.g. Netflix" class="w-40" /></Field>
      <Button type="submit" class="rounded-md" :disabled="create.isPending.value || !counterpartyIban.trim()">{{ create.isPending.value ? "Adding…" : "Add" }}</Button>
      <Button variant="muted-link" size="sm" class="!px-2" @click="emit('done')">Cancel</Button>
    </div>
    <ErrorText :error="create.error.value" />
  </form>
</template>
