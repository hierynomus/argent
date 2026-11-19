<script setup lang="ts">
import { ref } from "vue"
import { useMutation } from "@tanstack/vue-query"
import type { CashMovement, PortfolioDetail, StockPortfolioDetail } from "@argent/shared"
import { portfolioApis, useInvalidate } from "../../../api"
import { Button, Card, Td, Th } from "../../../components/ui"
import { fmtSymbolCur } from "../../../lib/format"
import Collapsible from "../Collapsible.vue"
import AccountForm from "./AccountForm.vue"
import CashMovementForm from "./CashMovementForm.vue"
import { CASH_DIRECTION, CASH_TYPE_LABELS } from "./config"

/**
 * The cash account behind a crypto or stocks portfolio: the money is deposited here before it is exchanged.
 * Shows the balance and account number, the forms to record movements and edit the account, and the list of
 * movements. The balance itself is derived (deposits, trades, dividends), see the backend `computeCash`.
 */
const props = defineProps<{ kind: "crypto" | "stocks"; portfolio: PortfolioDetail | StockPortfolioDetail }>()

const mode = ref<"idle" | "movement" | "account">("idle")
const close = () => (mode.value = "idle")
const invalidate = useInvalidate()
const remove = useMutation({
  mutationFn: (m: CashMovement) => portfolioApis[props.kind].removeCash(props.portfolio.id, m.id),
  onSuccess: () => invalidate.portfolios(props.kind),
})
const signed = (m: CashMovement) => CASH_DIRECTION[m.type] * parseFloat(m.amount)
</script>

<template>
  <Card class="px-4 py-3 mb-4" aria-label="Cash account">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <p class="text-xs text-gray-400 dark:text-gray-500">Cash account</p>
        <p class="text-sm text-gray-700 dark:text-gray-300">
          <span v-if="portfolio.accountNumber" class="font-mono">{{ portfolio.accountNumber }}</span>
          <span v-else class="text-gray-400 dark:text-gray-500">No account number</span>
        </p>
      </div>
      <div class="text-right">
        <p class="text-xs text-gray-400 dark:text-gray-500">Cash</p>
        <p class="text-lg font-semibold tabular-nums" :class="portfolio.cash < 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-gray-100'">{{ fmtSymbolCur(portfolio.cash, portfolio.currency) }}</p>
      </div>
    </div>
    <div v-if="portfolio.canEdit && mode === 'idle'" class="flex gap-4 mt-2">
      <Button variant="link" class="font-normal" @click="mode = 'movement'">+ Deposit / withdrawal</Button>
      <Button variant="link" class="font-normal" @click="mode = 'account'">Edit account</Button>
    </div>
  </Card>

  <CashMovementForm v-if="portfolio.canEdit && mode === 'movement'" :kind="kind" :portfolio="portfolio" @done="close" />
  <AccountForm v-if="portfolio.canEdit && mode === 'account'" :kind="kind" :portfolio="portfolio" @done="close" />

  <Collapsible v-if="portfolio.cashMovements.length > 0" class="mb-4" :title="`Cash movements (${portfolio.cashMovements.length})`">
    <table class="w-full text-sm min-w-[480px]">
      <thead>
        <tr class="text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wide border-b border-gray-100 dark:border-gray-800">
          <Th dense align="left">Date</Th>
          <Th dense align="left">Type</Th>
          <Th dense align="right">Amount</Th>
          <Th dense align="left">Notes</Th>
          <Th v-if="portfolio.canEdit" dense />
        </tr>
      </thead>
      <tbody class="divide-y divide-gray-50 dark:divide-gray-800">
        <tr v-for="m in [...portfolio.cashMovements].reverse()" :key="m.id" class="hover:bg-gray-50 dark:hover:bg-gray-800/50">
          <Td dense tone="faint">{{ m.movementDate }}</Td>
          <Td dense tone="normal">{{ CASH_TYPE_LABELS[m.type] }}</Td>
          <Td dense align="right" mono :class="signed(m) >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'">
            {{ signed(m) >= 0 ? "+" : "−" }}{{ fmtSymbolCur(Math.abs(signed(m)), portfolio.currency) }}
          </Td>
          <Td dense tone="faint">{{ m.notes ?? "" }}</Td>
          <Td v-if="portfolio.canEdit" dense align="right">
            <Button variant="danger-link" size="xs" :disabled="remove.isPending.value" @click="remove.mutate(m)">Delete</Button>
          </Td>
        </tr>
      </tbody>
    </table>
  </Collapsible>
</template>
