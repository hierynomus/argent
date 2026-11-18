<script setup lang="ts">
import { useMutation } from "@tanstack/vue-query"
import type { StockDividend } from "@argent/shared"
import { stocksApi, useInvalidate } from "../../../api"
import { Button, Th } from "../../../components/ui"
import { fmtSymbolCur } from "../../../lib/format"
import Collapsible from "../Collapsible.vue"

/** Collapsible, newest-first list of dividend payments. Unlike trades, dividends can be deleted. */
defineProps<{ dividends: StockDividend[]; currency: string; canEdit: boolean }>()

const invalidate = useInvalidate()
const remove = useMutation({
  mutationFn: (d: StockDividend) => stocksApi.removeDividend(d.portfolioId, d.id),
  onSuccess: () => invalidate.portfolios("stocks"),
})
</script>

<template>
  <Collapsible v-if="dividends.length > 0" :title="`Dividend history (${dividends.length})`">
    <table class="w-full text-sm min-w-[480px]">
      <thead>
        <tr class="text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wide border-b border-gray-100 dark:border-gray-800">
          <Th dense align="left">Date</Th>
          <Th dense align="left">Symbol</Th>
          <Th dense align="right">Amount</Th>
          <Th dense align="left">Notes</Th>
          <Th v-if="canEdit" dense />
        </tr>
      </thead>
      <tbody class="divide-y divide-gray-50 dark:divide-gray-800">
        <tr v-for="d in [...dividends].reverse()" :key="d.id" class="hover:bg-gray-50 dark:hover:bg-gray-800/50">
          <td class="px-4 py-2 text-gray-500 dark:text-gray-400">{{ d.paymentDate }}</td>
          <td class="px-4 py-2 font-mono font-medium text-indigo-700 dark:text-indigo-300">{{ d.symbol }}</td>
          <td class="px-4 py-2 text-right font-mono text-green-600 dark:text-green-400">+{{ fmtSymbolCur(parseFloat(d.amount), currency) }}</td>
          <td class="px-4 py-2 text-gray-500 dark:text-gray-400 text-xs">{{ d.notes ?? "" }}</td>
          <td v-if="canEdit" class="px-4 py-2 text-right">
            <Button variant="danger-link" size="xs" :disabled="remove.isPending.value" @click="remove.mutate(d)">Delete</Button>
          </td>
        </tr>
      </tbody>
    </table>
  </Collapsible>
</template>
