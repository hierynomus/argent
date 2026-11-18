<script setup lang="ts">
import { Card } from "../../components/ui"
import { computed } from "vue"
import { RouterLink } from "vue-router"
import { fmtCur, fmtDayMonth } from "../../lib/format"
import Skeleton from "./Skeleton.vue"

interface RecentTx {
  id: string
  bookingDate: string
  amount: string
  currency: string
  creditDebitIndicator: string
  counterpartyName: string | null
  description: string | null
  transferPeerId: string | null
}

const props = defineProps<{ transactions: RecentTx[]; loading: boolean }>()
// internal transfers are not income or spending
const visible = computed(() => props.transactions.filter((t) => !t.transferPeerId))
</script>

<template>
  <Card size="xl" class="p-6">
    <div class="flex items-center justify-between mb-4">
      <p class="text-sm font-semibold text-gray-700 dark:text-gray-300">Recent Transactions</p>
      <RouterLink to="/overview" class="text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-medium">View all →</RouterLink>
    </div>
    <div v-if="loading" class="space-y-3">
      <div v-for="i in 4" :key="i" class="flex items-center justify-between gap-3">
        <Skeleton class="h-4 w-12" />
        <Skeleton class="h-4 flex-1" />
        <Skeleton class="h-4 w-20" />
      </div>
    </div>
    <p v-else-if="visible.length === 0" class="text-sm text-gray-400 dark:text-gray-500">No recent transactions.</p>
    <div v-else class="divide-y divide-gray-50 dark:divide-gray-800/50">
      <div v-for="tx in visible" :key="tx.id" class="flex items-center gap-4 py-2.5">
        <span class="text-xs text-gray-400 dark:text-gray-500 w-12 shrink-0 tabular-nums">{{ fmtDayMonth(tx.bookingDate) }}</span>
        <span class="text-sm text-gray-700 dark:text-gray-300 flex-1 truncate">{{ tx.counterpartyName ?? tx.description ?? "—" }}</span>
        <span class="text-sm font-semibold tabular-nums shrink-0" :class="tx.creditDebitIndicator === 'CRDT' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'">
          {{ tx.creditDebitIndicator === "CRDT" ? "+" : "−" }}{{ fmtCur(parseFloat(tx.amount), tx.currency) }}
        </span>
      </div>
    </div>
  </Card>
</template>
