<script setup lang="ts">
import { computed } from "vue"
import type { MetalPortfolioDetail } from "@argent/shared"
import { Card, Th } from "../../../components/ui"
import { capitalize, fmtSignificant, fmtSymbolCur, pnlColor, pnlFmt } from "../../../lib/format"
import SummaryTiles from "../SummaryTiles.vue"
import { aggregateMetals } from "../overview"
import { standardTiles } from "../tiles"

/** The overview tab of the metals page: what is held of each metal across every visible portfolio. */
const props = defineProps<{ details: MetalPortfolioDetail[] }>()
const groups = computed(() => aggregateMetals(props.details))
</script>

<template>
  <Card v-if="groups.length === 0" class="px-5 py-10 text-center text-gray-400 dark:text-gray-500 text-sm">Nothing to show yet.</Card>
  <section v-for="g in groups" :key="g.currency" :aria-label="`${g.currency} portfolios`" class="mb-8">
    <p class="text-sm text-gray-500 dark:text-gray-400 mb-3">
      <template v-if="groups.length > 1"><span class="font-semibold text-gray-700 dark:text-gray-300">{{ g.currency }}</span> · </template>
      {{ g.portfolioNames.length }} {{ g.portfolioNames.length === 1 ? "portfolio" : "portfolios" }}: {{ g.portfolioNames.join(", ") }}
    </p>
    <SummaryTiles :tiles="standardTiles({ openCost: g.openCost, currentValue: g.currentValue, unrealized: g.unrealized, realized: g.realized }, g.currency)" />
    <Card class="overflow-hidden mb-4 overflow-x-auto">
      <table class="w-full text-sm min-w-[700px]">
        <thead>
          <tr class="border-b border-gray-100 dark:border-gray-800 text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wide">
            <Th align="left">Metal</Th>
            <Th align="right">Lots</Th>
            <Th align="right">Pieces</Th>
            <Th align="right">Weight</Th>
            <Th align="right">Cost</Th>
            <Th align="right">Value</Th>
            <Th align="right">Unrealized</Th>
            <Th align="right">Realized</Th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-50 dark:divide-gray-800">
          <tr v-for="r in g.rows" :key="r.metal" class="hover:bg-gray-50 dark:hover:bg-gray-800/50">
            <td class="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">{{ capitalize(r.metal) }}</td>
            <td class="px-4 py-3 text-right font-mono text-gray-600 dark:text-gray-400">{{ r.lots }}</td>
            <td class="px-4 py-3 text-right font-mono text-gray-900 dark:text-gray-100">{{ r.pieces }}</td>
            <td class="px-4 py-3 text-right font-mono text-gray-600 dark:text-gray-400">{{ fmtSignificant(r.grams, 8) }} g</td>
            <td class="px-4 py-3 text-right font-mono text-gray-600 dark:text-gray-400">{{ fmtSymbolCur(r.cost, g.currency) }}</td>
            <td class="px-4 py-3 text-right font-mono text-gray-900 dark:text-gray-100">
              <template v-if="r.value !== null">{{ fmtSymbolCur(r.value, g.currency) }}</template><span v-else class="text-gray-300 dark:text-gray-600">—</span>
            </td>
            <td class="px-4 py-3 text-right font-mono" :class="r.unrealized !== null ? pnlColor(r.unrealized) : 'text-gray-300 dark:text-gray-600'">{{ r.unrealized !== null ? pnlFmt(r.unrealized, g.currency) : "—" }}</td>
            <td class="px-4 py-3 text-right font-mono" :class="pnlColor(r.realized)">{{ pnlFmt(r.realized, g.currency) }}</td>
          </tr>
        </tbody>
      </table>
    </Card>
  </section>
</template>
