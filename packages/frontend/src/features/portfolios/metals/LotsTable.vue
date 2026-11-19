<script setup lang="ts">
import { Card, Td, Th } from "../../../components/ui"
import { ref } from "vue"
import type { MetalLot } from "@argent/shared"
import { capitalize, fmtSignificant, fmtSymbolCur, pnlColor, pnlFmt } from "../../../lib/format"
import SaleForm from "./SaleForm.vue"

/** The physical inventory: one row per purchase lot, with an inline "Sell" form under the lot being sold. */
defineProps<{ portfolioId: string; lots: MetalLot[]; currency: string; canEdit: boolean }>()

const COLUMNS = 11
const sellingId = ref<string | null>(null)
</script>

<template>
  <Card class="overflow-hidden mb-4 overflow-x-auto">
    <table class="w-full text-sm min-w-[860px]">
      <thead>
        <tr class="border-b border-gray-100 dark:border-gray-800 text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wide">
          <Th align="left">Item</Th>
          <Th align="left">Metal</Th>
          <Th align="left">Form</Th>
          <Th align="right">Qty</Th>
          <Th align="right">Weight/pc</Th>
          <Th align="right">Remaining</Th>
          <Th align="right">Cost/pc</Th>
          <Th align="right">Value/pc</Th>
          <Th align="right">Unr. P&amp;L</Th>
          <Th align="right">Real. P&amp;L</Th>
          <Th><span class="sr-only">Actions</span></Th>
        </tr>
      </thead>
      <tbody class="divide-y divide-gray-50 dark:divide-gray-800">
        <tr v-if="lots.length === 0">
          <td :colspan="COLUMNS" class="px-4 py-8 text-center text-gray-400 dark:text-gray-500">No lots yet. Add your first purchase below.</td>
        </tr>
        <template v-for="lot in lots" :key="lot.id">
          <tr class="hover:bg-gray-50 dark:hover:bg-gray-800/50" :class="lot.remainingQuantity === 0 && 'opacity-60'">
            <td class="px-4 py-3 text-gray-900 dark:text-gray-100 font-medium">
              <template v-if="lot.itemName">{{ lot.itemName }}</template>
              <span v-else class="text-gray-400 dark:text-gray-500 italic">—</span>
            </td>
            <Td tone="normal">{{ capitalize(lot.metal) }}</Td>
            <Td tone="faint">
              <template v-if="lot.itemForm">{{ capitalize(lot.itemForm) }}</template>
              <span v-else class="text-gray-300 dark:text-gray-600">—</span>
            </Td>
            <Td align="right" mono tone="normal">{{ lot.quantity }}</Td>
            <Td align="right" mono tone="muted">{{ fmtSignificant(parseFloat(lot.weightPerPiece), 6) }} {{ lot.unit }}</Td>
            <Td align="right" mono tone="strong">{{ lot.remainingQuantity }}</Td>
            <Td align="right" mono tone="muted">{{ fmtSymbolCur(parseFloat(lot.pricePerPiece), currency) }}</Td>
            <Td align="right" mono tone="muted">
              <template v-if="lot.currentValuePerPiece != null">{{ fmtSymbolCur(lot.currentValuePerPiece, currency) }}</template>
              <span v-else class="text-gray-300 dark:text-gray-600">—</span>
            </Td>
            <Td align="right" mono :class="lot.unrealizedPnL != null ? pnlColor(lot.unrealizedPnL) : 'text-gray-300 dark:text-gray-600'">
              {{ lot.unrealizedPnL != null ? pnlFmt(lot.unrealizedPnL, currency) : "—" }}
            </Td>
            <Td align="right" mono :class="pnlColor(lot.realizedPnL)">{{ pnlFmt(lot.realizedPnL, currency) }}</Td>
            <Td align="right">
              <button
                v-if="canEdit && lot.remainingQuantity > 0"
                type="button"
                class="px-2 py-1 text-xs rounded font-medium transition-colors"
                :class="
                  sellingId === lot.id
                    ? 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                    : 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40'
                "
                @click="sellingId = sellingId === lot.id ? null : lot.id"
              >
                {{ sellingId === lot.id ? "Cancel" : "Sell" }}
              </button>
            </Td>
          </tr>
          <tr v-if="sellingId === lot.id">
            <td :colspan="COLUMNS" class="px-4 py-3 bg-red-50 dark:bg-red-900/10 border-t border-red-100 dark:border-red-900/30">
              <SaleForm :portfolio-id="portfolioId" :lot="lot" :currency="currency" @done="sellingId = null" />
            </td>
          </tr>
        </template>
      </tbody>
    </table>
  </Card>
</template>
