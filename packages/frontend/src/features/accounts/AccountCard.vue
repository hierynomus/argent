<script setup lang="ts">
import { computed } from "vue"
import { RouterLink } from "vue-router"
import type { Account } from "@argent/shared"
import { useRecentTransactions } from "../../api"
import { fmtAmount, fmtBalance, fmtDate } from "../../lib/format"

/** One bank account: balance header (links to the filtered Overview) plus its 10 latest transactions. */
const props = defineProps<{ account: Account }>()
const { data } = useRecentTransactions(10, () => props.account.id)
const txs = computed(() => data.value?.data ?? [])
</script>

<template>
  <div class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
    <RouterLink :to="`/overview?account=${account.id}`" class="block px-6 py-5 border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
      <div class="flex items-start justify-between gap-4">
        <div>
          <p class="text-sm text-gray-500 dark:text-gray-400">{{ account.iban }}</p>
          <p class="text-lg font-semibold text-gray-900 dark:text-gray-100 mt-0.5">{{ account.name ?? account.iban }}</p>
          <p v-if="account.openingBalanceDate" class="text-xs text-gray-400 dark:text-gray-500 mt-1">since {{ fmtDate(account.openingBalanceDate) }}</p>
        </div>
        <div class="text-right flex-shrink-0">
          <p class="text-2xl font-bold text-gray-900 dark:text-gray-100">{{ fmtBalance(account.balance, account.currency) }}</p>
          <p class="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{{ account.currency }}</p>
        </div>
      </div>
    </RouterLink>

    <div class="px-6 py-4">
      <p class="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-3">Recent transactions</p>
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
    </div>
  </div>
</template>
