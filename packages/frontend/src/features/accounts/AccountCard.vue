<script setup lang="ts">
import { Button, Card, ConfirmButton, ErrorText } from "../../components/ui"
import ManualTransactionForm from "../transactions/ManualTransactionForm.vue"
import { computed, ref } from "vue"
import { useMutation } from "@tanstack/vue-query"
import { RouterLink } from "vue-router"
import { hasRealIban, type Account } from "@argent/shared"
import { deleteAccount, useInvalidate, useRecentTransactions } from "../../api"
import { fmtAmount, fmtBalance, fmtDate } from "../../lib/format"

/** One bank account: balance header (links to the filtered Overview) plus its 10 latest transactions. */
const props = defineProps<{ account: Account }>()
const { data } = useRecentTransactions(10, () => props.account.id)
const txs = computed(() => data.value?.data ?? [])

const adding = ref(false)
const invalidate = useInvalidate()
const remove = useMutation({ mutationFn: () => deleteAccount(props.account.id), onSuccess: () => invalidate.afterManualEntry() })
</script>

<template>
  <Card size="xl" class="overflow-hidden">
    <RouterLink :to="`/overview?account=${account.id}`" class="block px-6 py-5 border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
      <div class="flex items-start justify-between gap-4">
        <div>
          <p v-if="hasRealIban(account)" class="text-sm text-gray-500 dark:text-gray-400">{{ account.iban }}</p>
          <p class="text-lg font-semibold text-gray-900 dark:text-gray-100 mt-0.5">{{ account.name ?? account.iban }}</p>
          <p v-if="account.openingBalanceDate" class="text-xs text-gray-400 dark:text-gray-500 mt-1">since {{ fmtDate(account.openingBalanceDate) }}</p>
        </div>
        <div class="text-right shrink-0">
          <p class="text-2xl font-bold text-gray-900 dark:text-gray-100">{{ fmtBalance(account.balance, account.currency) }}</p>
          <p class="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{{ account.currency }}</p>
        </div>
      </div>
    </RouterLink>

    <div class="px-6 py-4">
      <div class="flex items-center justify-between mb-3">
        <p class="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">Recent transactions</p>
        <Button v-if="!adding" variant="link" size="xs" @click="adding = true">+ Add transaction</Button>
      </div>
      <div v-if="adding" class="mb-4 pb-4 border-b border-gray-100 dark:border-gray-800">
        <ManualTransactionForm :account="account" @done="adding = false" />
      </div>
      <p v-if="txs.length === 0" class="text-sm text-gray-400 dark:text-gray-500 py-2">No transactions yet.</p>
      <table v-else class="w-full text-sm">
        <tbody class="divide-y divide-gray-100 dark:divide-gray-800">
          <tr v-for="tx in txs" :key="tx.id">
            <td class="py-2 pr-4 text-gray-400 dark:text-gray-500 whitespace-nowrap w-28">{{ fmtDate(tx.bookingDate) }}</td>
            <td class="py-2 pr-4 text-gray-700 dark:text-gray-300 min-w-0 truncate max-w-0 w-full">{{ tx.counterpartyName ?? tx.description ?? "—" }}</td>
            <td class="py-2 text-right whitespace-nowrap font-medium tabular-nums" :class="tx.creditDebitIndicator === 'CRDT' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'">
              {{ fmtAmount(tx.amount, tx.creditDebitIndicator, tx.currency) }}
            </td>
          </tr>
        </tbody>
      </table>
      <div v-if="account.source === 'manual' && txs.length === 0 && !adding" class="mt-3">
        <ConfirmButton label="Delete account" prompt="Delete this account?" confirm-label="Yes" @confirm="remove.mutate()" />
        <ErrorText :error="remove.error.value" />
      </div>
    </div>
  </Card>
</template>
