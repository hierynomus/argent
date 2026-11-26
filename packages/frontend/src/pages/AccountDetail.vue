<script setup lang="ts">
import { computed, ref } from "vue"
import { RouterLink, useRoute, useRouter } from "vue-router"
import { useMutation } from "@tanstack/vue-query"
import { hasRealIban } from "@argent/shared"
import { deleteAccount, updateAccount, useAccounts, useInvalidate } from "../api"
import { Button, Card, ConfirmButton, EmptyState, ErrorText, LoadingText } from "../components/ui"
import BalanceChart from "../features/accounts/BalanceChart.vue"
import AccountEditForm from "../features/accounts/AccountEditForm.vue"
import { holdersOf } from "../features/accounts/groupAccounts"
import ManualTransactionForm from "../features/transactions/ManualTransactionForm.vue"
import TransactionBrowser from "../features/transactions/TransactionBrowser.vue"
import { fmtBalance, fmtDate } from "../lib/format"

/** One account: its balance and details, everything you can do to it, and its transactions. */
const route = useRoute()
const router = useRouter()
const invalidate = useInvalidate()
const { data, isLoading } = useAccounts()
const account = computed(() => (data.value ?? []).find((a) => a.id === route.params.id))
const holders = computed(() => holdersOf(data.value ?? []))

const editing = ref(false)
const adding = ref(false)

const toggleHidden = useMutation({
  mutationFn: () => updateAccount(account.value!.id, { hidden: !account.value!.hidden }),
  onSuccess: () => invalidate.accounts(),
})
const remove = useMutation({
  mutationFn: () => deleteAccount(account.value!.id),
  onSuccess: async () => {
    await router.replace("/accounts")
    await invalidate.afterManualEntry()
  },
})

const TYPE_LABEL = { checking: "Checking", savings: "Savings", cash: "Cash" }
</script>

<template>
  <LoadingText v-if="isLoading" />
  <EmptyState v-else-if="!account" title="This account was not found." hint="It may have been deleted, or it is not shared with you.">
    <RouterLink to="/accounts" class="mt-3 inline-block text-sm text-indigo-600 dark:text-indigo-400 hover:underline">← All accounts</RouterLink>
  </EmptyState>
  <div v-else class="space-y-6">
    <RouterLink to="/accounts" class="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">← All accounts</RouterLink>

    <Card size="xl" class="px-6 py-5">
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div class="min-w-0">
          <h1 class="text-2xl font-bold text-gray-900 dark:text-gray-100">{{ account.name ?? account.iban }}</h1>
          <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
            <span v-if="hasRealIban(account)" class="font-mono">{{ account.iban }} · </span>{{ TYPE_LABEL[account.type ?? "checking"] }}<template v-if="account.holder"> · {{ account.holder }}</template><template v-if="account.hidden"> · Hidden</template>
          </p>
          <p v-if="account.openingBalanceDate" class="mt-1 text-xs text-gray-400 dark:text-gray-500">Balance counted from {{ fmtDate(account.openingBalanceDate) }}</p>
        </div>
        <div class="text-right shrink-0">
          <p class="text-3xl font-bold tabular-nums" :class="Number(account.balance) < 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-gray-100'">{{ fmtBalance(account.balance, account.currency) }}</p>
          <p class="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{{ account.currency }}</p>
        </div>
      </div>

      <div class="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-gray-100 dark:border-gray-800 pt-3">
        <Button v-if="!adding" variant="link" size="xs" @click="adding = true">+ Add transaction</Button>
        <Button v-if="!editing" variant="link" size="xs" @click="editing = true">Edit</Button>
        <Button variant="muted-link" size="xs" :disabled="toggleHidden.isPending.value" @click="toggleHidden.mutate()">{{ account.hidden ? "Show in lists" : "Hide from lists" }}</Button>
        <ConfirmButton label="Delete account" prompt="Delete this account and all its transactions?" confirm-label="Yes, delete" @confirm="remove.mutate()" />
      </div>
      <ErrorText :error="toggleHidden.error.value ?? remove.error.value" />

      <AccountEditForm v-if="editing" :account="account" :holders="holders" @done="editing = false" />
      <div v-if="adding" class="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800">
        <ManualTransactionForm :account="account" @done="adding = false" />
      </div>

      <BalanceChart :account-id="account.id" :name="account.name ?? account.iban" />
    </Card>

    <TransactionBrowser :key="account.id" :account-id="account.id" />
  </div>
</template>
