<script setup lang="ts">
import { Card, Checkbox, Td, Th } from "../../components/ui"
import { computed } from "vue"
import type { TransactionWithDetails } from "@argent/shared"
import { fmtSignedAmount } from "../../lib/format"
import CategoryChip from "./CategoryChip.vue"

/** The transaction list with row checkboxes (bulk actions) and click-to-open details. */
const props = defineProps<{
  rows: TransactionWithDetails[]
  /** the row whose detail panel is open */
  openId: string | null
  selectedIds: ReadonlySet<string>
}>()
const emit = defineEmits<{ open: [tx: TransactionWithDetails]; toggle: [id: string]; toggleAll: []; openSubscriptions: [] }>()

const allSelected = computed(() => props.rows.length > 0 && props.rows.every((r) => props.selectedIds.has(r.id)))
</script>

<template>
  <Card class="overflow-hidden">
    <table class="w-full text-sm">
      <thead>
        <tr class="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
          <Th class="w-10"><Checkbox aria-label="Select all on this page" :checked="allSelected" @change="emit('toggleAll')" /></Th>
          <Th>Date</Th>
          <Th>Account</Th>
          <Th>Counterparty</Th>
          <Th>Description</Th>
          <Th align="right">Amount</Th>
          <Th>Label</Th>
        </tr>
      </thead>
      <tbody class="divide-y divide-gray-100 dark:divide-gray-800">
        <tr
          v-for="tx in rows"
          :key="tx.id"
          class="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
          :class="[openId === tx.id && 'bg-indigo-50 dark:bg-indigo-950', selectedIds.has(tx.id) && 'bg-indigo-50/60 dark:bg-indigo-950/40']"
          @click="emit('open', tx)"
        >
          <td class="px-4 py-3 w-10" @click.stop>
            <Checkbox :aria-label="`Select transaction ${tx.description ?? tx.id}`" :checked="selectedIds.has(tx.id)" @change="emit('toggle', tx.id)" />
          </td>
          <td class="px-4 py-3 whitespace-nowrap text-gray-600 dark:text-gray-400">{{ tx.bookingDate }}</td>
          <td class="px-4 py-3 text-gray-500 dark:text-gray-400 text-xs max-w-[120px] truncate">{{ tx.account.name ?? tx.account.iban }}</td>
          <td class="px-4 py-3 max-w-[140px] truncate">
            <span v-if="tx.transferPeer" class="text-indigo-500 dark:text-indigo-400 text-xs font-medium">↔ {{ tx.transferPeer.account.name ?? tx.transferPeer.account.iban }}</span>
            <span v-else class="text-gray-900 dark:text-gray-100">
              <template v-if="tx.counterpartyName">{{ tx.counterpartyName }}</template>
              <span v-else class="text-gray-400 dark:text-gray-500">—</span>
            </span>
          </td>
          <td class="px-4 py-3 max-w-[220px]">
            <div class="text-gray-600 dark:text-gray-400 truncate">
              <template v-if="tx.description">{{ tx.description }}</template>
              <span v-else class="text-gray-400 dark:text-gray-500">—</span>
            </div>
            <button
              v-if="tx.subscriptionId"
              type="button"
              class="mt-0.5 inline-flex items-center gap-0.5 text-[10px] text-indigo-500 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 font-medium leading-none"
              @click.stop="emit('openSubscriptions')"
            >
              ↻ subscription
            </button>
          </td>
          <td class="px-4 py-3 text-right font-mono font-medium whitespace-nowrap" :class="tx.creditDebitIndicator === 'CRDT' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'">
            {{ fmtSignedAmount(tx.amount, tx.creditDebitIndicator, tx.currency) }}
          </td>
          <Td><CategoryChip :category="tx.category" /></Td>
        </tr>
        <tr v-if="rows.length === 0">
          <td colspan="7" class="px-4 py-10 text-center text-gray-400 dark:text-gray-500 text-sm">No transactions found.</td>
        </tr>
      </tbody>
    </table>
  </Card>
</template>
