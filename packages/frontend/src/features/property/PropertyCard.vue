<script setup lang="ts">
import { computed, ref } from "vue"
import type { PropertyWithDetails } from "@argent/shared"
import { Badge, Button, Card } from "../../components/ui"
import { fmtCur, fmtDate, pnlColor } from "../../lib/format"
import { PROPERTY_TYPE_LABELS } from "./config"
import EditPropertyForm from "./EditPropertyForm.vue"
import LiabilityLinks from "./LiabilityLinks.vue"
import PropertyActions from "./PropertyActions.vue"
import ValuationHistory from "./ValuationHistory.vue"

/** One property: value, what it was bought for, what is owed on it and the equity, its valuations and links. */
const props = defineProps<{ property: PropertyWithDetails }>()
const editing = ref(false)
const linking = ref(false)

const money = (n: number) => fmtCur(n, props.property.currency)
const gainPct = computed(() => {
  const price = props.property.purchasePrice ? parseFloat(props.property.purchasePrice) : 0
  return price > 0 && props.property.gainSincePurchase !== null ? (props.property.gainSincePurchase / price) * 100 : null
})
const fmtPct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(1).replace(".", ",")}%`
</script>

<template>
  <Card class="overflow-hidden" :aria-label="property.name" role="region">
    <div class="px-6 py-5">
      <div class="flex items-start justify-between gap-4 flex-wrap mb-4">
        <div class="flex items-center gap-2">
          <h2 class="text-lg font-semibold text-gray-900 dark:text-gray-100">{{ property.name }}</h2>
          <Badge class="bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">{{ PROPERTY_TYPE_LABELS[property.type] }}</Badge>
        </div>
        <div v-if="property.canEdit" class="flex items-center gap-3">
          <Button variant="link" size="xs" @click="editing = !editing">{{ editing ? "Close" : "Edit" }}</Button>
          <Button variant="link" size="xs" @click="linking = !linking">{{ linking ? "Close links" : "Link mortgage / loan" }}</Button>
        </div>
      </div>

      <EditPropertyForm v-if="editing" :property="property" @done="editing = false" />
      <LiabilityLinks v-if="linking" :property="property" @done="linking = false" />

      <dl class="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div>
          <dt class="text-xs text-gray-400 dark:text-gray-500">Worth</dt>
          <dd class="text-xl font-bold text-gray-900 dark:text-gray-100 tabular-nums">{{ property.currentValue !== null ? money(property.currentValue) : "—" }}</dd>
          <dd v-if="property.currentValueDate" class="text-xs text-gray-400 dark:text-gray-500">as of {{ fmtDate(property.currentValueDate) }}</dd>
          <dd v-else class="text-xs text-gray-400 dark:text-gray-500">no valuation yet</dd>
        </div>
        <div>
          <dt class="text-xs text-gray-400 dark:text-gray-500">Owed</dt>
          <dd class="text-xl font-bold text-gray-900 dark:text-gray-100 tabular-nums">{{ money(property.debt) }}</dd>
          <dd class="text-xs text-gray-400 dark:text-gray-500">{{ property.liabilities.length }} {{ property.liabilities.length === 1 ? "mortgage/loan" : "mortgages/loans" }}</dd>
        </div>
        <div>
          <dt class="text-xs text-gray-400 dark:text-gray-500">Equity</dt>
          <dd class="text-xl font-bold tabular-nums" :class="property.equity === null ? 'text-gray-400' : property.equity >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'">
            {{ property.equity !== null ? money(property.equity) : "—" }}
          </dd>
          <dd class="text-xs text-gray-400 dark:text-gray-500">worth minus owed</dd>
        </div>
        <div>
          <dt class="text-xs text-gray-400 dark:text-gray-500">Since purchase</dt>
          <dd v-if="property.gainSincePurchase !== null" class="text-xl font-bold tabular-nums" :class="pnlColor(property.gainSincePurchase)">
            {{ property.gainSincePurchase >= 0 ? "+" : "" }}{{ money(property.gainSincePurchase) }}
          </dd>
          <dd v-else class="text-xl font-bold text-gray-400">—</dd>
          <dd class="text-xs text-gray-400 dark:text-gray-500">
            <template v-if="property.purchasePrice">bought for {{ money(parseFloat(property.purchasePrice)) }}<template v-if="property.purchaseDate"> in {{ fmtDate(property.purchaseDate) }}</template><template v-if="gainPct !== null"> ({{ fmtPct(gainPct) }})</template></template>
            <template v-else>no purchase price</template>
          </dd>
        </div>
      </dl>

      <div class="mt-5">
        <h3 class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Financed by</h3>
        <p v-if="property.liabilities.length === 0" class="text-sm text-gray-400 dark:text-gray-500">No mortgage or loan linked.</p>
        <ul v-else class="divide-y divide-gray-50 dark:divide-gray-800 text-sm">
          <li v-for="l in property.liabilities" :key="`${l.kind}-${l.id}`" class="flex items-center justify-between py-1.5">
            <span class="text-gray-700 dark:text-gray-300">{{ l.name }} <span class="text-xs text-gray-400 dark:text-gray-500">{{ l.kind }}</span></span>
            <span class="tabular-nums text-gray-900 dark:text-gray-100">{{ money(l.balance) }} <span class="text-xs text-gray-400 dark:text-gray-500">· {{ money(l.monthlyPayment) }}/mo</span></span>
          </li>
        </ul>
      </div>

      <div class="mt-5"><ValuationHistory :property="property" /></div>

      <PropertyActions v-if="property.isOwner" :property="property" />
    </div>
  </Card>
</template>
