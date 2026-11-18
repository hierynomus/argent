<script setup lang="ts">
import { useSubscriptionTransactions } from "../../api"
import { fmtBalance } from "../../lib/format"

/** The payments a subscription was detected from. Loads when first shown. */
const props = defineProps<{ subscriptionId: string; emptyText: string; dividerClass: string }>()
const { data: txs, isLoading } = useSubscriptionTransactions(() => props.subscriptionId, true)
</script>

<template>
  <p v-if="isLoading" class="text-gray-400 dark:text-gray-500 text-xs">Loading transactions…</p>
  <p v-else-if="!txs || txs.length === 0" class="text-gray-400 dark:text-gray-500 text-xs">{{ emptyText }}</p>
  <div v-else class="divide-y" :class="dividerClass">
    <div v-for="tx in txs" :key="tx.id" class="flex items-center justify-between py-1.5 text-xs">
      <span class="text-gray-500 dark:text-gray-400 w-24 shrink-0">{{ tx.bookingDate }}</span>
      <span class="text-gray-600 dark:text-gray-400 flex-1 truncate px-3">{{ tx.description ?? "—" }}</span>
      <span class="text-red-600 dark:text-red-400 font-mono font-medium whitespace-nowrap">{{ fmtBalance(tx.amount, tx.currency) }}</span>
    </div>
  </div>
</template>
