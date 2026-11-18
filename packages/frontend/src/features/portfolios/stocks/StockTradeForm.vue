<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue"
import { useMutation } from "@tanstack/vue-query"
import { createStockTradeSchema, type StockPortfolioDetail } from "@argent/shared"
import { stocksApi, useInvalidate } from "../../../api"
import { Field, Input, Select } from "../../../components/ui"
import { fmtMaxDecimals } from "../../../lib/format"
import { useFormErrors } from "../../../lib/validate"
import FormActions from "../FormActions.vue"
import FormCard from "../FormCard.vue"
import TradeKindToggle from "../TradeKindToggle.vue"

/** Records a buy or sell. When buying, leaving the ticker field looks the company name up and fills it in. */
const props = defineProps<{ portfolio: StockPortfolioDetail }>()
const emit = defineEmits<{ done: [] }>()

type Kind = "buy" | "sell"
const KINDS = ["buy", "sell"] as const
const EMPTY = { symbol: "", assetName: "", quantity: "", amount: "", tradeDate: "", notes: "" }

const invalidate = useInvalidate()
const { errors, check } = useFormErrors()
const cur = computed(() => props.portfolio.currency)
const kind = ref<Kind>("buy")
const form = reactive({ ...EMPTY })
const symbolUnknown = ref(false)
watch(kind, () => {
  Object.assign(form, EMPTY)
  symbolUnknown.value = false
})
watch(() => form.symbol, () => (symbolUnknown.value = false))

const held = computed(() => props.portfolio.positions.filter((p) => p.balance > 1e-10))

const body = () => ({
  tradeDate: form.tradeDate,
  type: kind.value,
  symbol: form.symbol.toUpperCase().trim(),
  quantity: form.quantity,
  amount: form.amount,
  assetName: kind.value === "buy" ? form.assetName.trim() || undefined : undefined,
  notes: form.notes.trim() || undefined,
})

const save = useMutation({
  mutationFn: () => stocksApi.addTrade(props.portfolio.id, body()),
  onSuccess: () => {
    invalidate.portfolios("stocks")
    emit("done")
  },
})

async function lookupSymbol() {
  const symbol = form.symbol.trim()
  if (kind.value !== "buy" || !symbol) {
    symbolUnknown.value = false
    return
  }
  try {
    const result = await stocksApi.lookup(symbol)
    symbolUnknown.value = !result.name
    // never overwrite a name the user typed; clear a stale one when the ticker is unknown
    if (result.name) {
      if (!form.assetName.trim()) form.assetName = result.name
    } else {
      form.assetName = ""
    }
  } catch {
    // a failed lookup is not evidence of a bad symbol — don't flag it
    symbolUnknown.value = false
  }
}

function submit() {
  if (check(createStockTradeSchema, body())) save.mutate()
}
</script>

<template>
  <FormCard @submit="submit">
    <TradeKindToggle v-model="kind" :options="KINDS" />

    <div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
      <div>
        <Field label="Symbol" :error="errors.symbol">
          <Select v-if="kind === 'sell' && held.length > 0" v-model="form.symbol" required class="w-full">
            <option value="">Select…</option>
            <option v-for="p in held" :key="p.symbol" :value="p.symbol">{{ p.symbol }} ({{ fmtMaxDecimals(p.balance, 4) }})</option>
          </Select>
          <Input
            v-else
            v-model="form.symbol"
            required
            placeholder="AAPL"
            class="w-full"
            :class="symbolUnknown && 'border-orange-400 dark:border-orange-500 focus:ring-orange-400'"
            @blur="lookupSymbol"
          />
        </Field>
        <p v-if="symbolUnknown" class="text-xs text-orange-600 dark:text-orange-400 mt-1">Unknown ticker — double check the symbol</p>
      </div>

      <Field v-if="kind === 'buy'" label="Name"><Input v-model="form.assetName" placeholder="Apple Inc." class="w-full" /></Field>

      <Field :label="kind === 'buy' ? 'Shares bought' : 'Shares sold'" :error="errors.quantity">
        <Input v-model="form.quantity" required type="number" step="any" min="0" placeholder="10" class="w-full" />
      </Field>
      <Field :label="`${cur} ${kind === 'buy' ? 'paid' : 'received'}`" :error="errors.amount">
        <Input v-model="form.amount" required type="number" step="any" min="0" placeholder="1500" class="w-full" />
      </Field>
      <Field label="Date" :error="errors.tradeDate"><Input v-model="form.tradeDate" required type="date" class="w-full" /></Field>
      <Field label="Notes"><Input v-model="form.notes" placeholder="Optional" class="w-full" /></Field>
    </div>

    <FormActions submit-label="Save trade" :pending="save.isPending.value" :error="save.error.value" @cancel="emit('done')" />
  </FormCard>
</template>
