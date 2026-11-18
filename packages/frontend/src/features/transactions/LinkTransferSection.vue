<script setup lang="ts">
import { ref } from "vue"
import { useMutation } from "@tanstack/vue-query"
import type { TransactionWithDetails } from "@argent/shared"
import { linkTransfer, useTransferSuggestions } from "../../api"
import { Button, ErrorText } from "../../components/ui"
import { fmtSignedAmount } from "../../lib/format"

/** "Link as transfer": suggests transactions on other accounts that look like the other leg, and links the chosen one. */
const props = defineProps<{ tx: TransactionWithDetails }>()
const emit = defineEmits<{ linked: [updated: TransactionWithDetails] }>()

const open = ref(false)
const { data: suggestions, isLoading } = useTransferSuggestions(() => props.tx.id, open)
const link = useMutation({ mutationFn: (peerId: string) => linkTransfer(props.tx.id, { peerId }), onSuccess: (updated) => emit("linked", updated) })
</script>

<template>
  <div>
    <Button variant="link" class="text-sm" @click="open = !open">Link as transfer {{ open ? "▴" : "▾" }}</Button>
    <div v-if="open" class="mt-2 border border-gray-200 dark:border-gray-700 rounded-md overflow-hidden text-xs">
      <p v-if="isLoading" class="text-gray-400 dark:text-gray-500 px-3 py-2">Finding suggestions…</p>
      <p v-else-if="suggestions?.length === 0" class="text-gray-400 dark:text-gray-500 px-3 py-2">No matching transactions found.</p>
      <div v-else class="divide-y divide-gray-100 dark:divide-gray-800">
        <button
          v-for="s in suggestions"
          :key="s.id"
          type="button"
          :disabled="link.isPending.value"
          class="w-full flex items-center justify-between px-3 py-2 hover:bg-indigo-50 dark:hover:bg-indigo-950 text-left disabled:opacity-50"
          @click="link.mutate(s.id)"
        >
          <div>
            <div class="font-medium text-gray-900 dark:text-gray-100">{{ s.account.name ?? s.account.iban }}</div>
            <div class="text-gray-400 dark:text-gray-500">{{ s.bookingDate }}</div>
          </div>
          <div class="font-mono font-medium" :class="s.creditDebitIndicator === 'CRDT' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'">
            {{ fmtSignedAmount(s.amount, s.creditDebitIndicator, s.currency) }}
          </div>
        </button>
      </div>
      <ErrorText :error="link.error.value" />
    </div>
  </div>
</template>
