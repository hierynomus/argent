<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue"
import { useMutation } from "@tanstack/vue-query"
import { createCryptoTradeSchema, type CreateCryptoTradeBody, type PortfolioDetail } from "@argent/shared"
import { cryptoApi, useInvalidate } from "../../../api"
import { Field, Input, Select } from "../../../components/ui"
import { fmtSignificant } from "../../../lib/format"
import { useFormErrors } from "../../../lib/validate"
import FormActions from "../FormActions.vue"
import FormCard from "../FormCard.vue"
import TradeKindToggle from "../TradeKindToggle.vue"

/**
 * Records a buy, sell or swap. Everything is stored as "from X to Y":
 *   buy  = base currency → coin,   sell = coin → base currency,   swap = coin → coin.
 */
const props = defineProps<{ portfolio: PortfolioDetail }>()
const emit = defineEmits<{ done: [] }>()

type Direction = "buy" | "swap" | "sell"
const DIRECTIONS = ["buy", "swap", "sell"] as const
const EMPTY = { symbol: "", coinName: "", baseCurAmount: "", coinAmount: "", toSymbol: "", toAmount: "", tradeDate: "", notes: "" }
const upper = (s: string) => s.toUpperCase().trim()

const invalidate = useInvalidate()
const { errors, check } = useFormErrors()
const cur = computed(() => props.portfolio.currency)
const direction = ref<Direction>("buy")
const form = reactive({ ...EMPTY })
watch(direction, () => Object.assign(form, EMPTY))

const sellable = computed(() => props.portfolio.positions.filter((p) => p.balance > 1e-10))

function buildBody(): CreateCryptoTradeBody {
  const notes = form.notes.trim() || undefined
  if (direction.value === "buy") {
    return { tradeDate: form.tradeDate, fromSymbol: cur.value, fromAmount: form.baseCurAmount, toSymbol: upper(form.symbol), toAmount: form.coinAmount, assetName: form.coinName.trim() || undefined, notes }
  }
  if (direction.value === "sell") {
    return { tradeDate: form.tradeDate, fromSymbol: upper(form.symbol), fromAmount: form.coinAmount, toSymbol: cur.value, toAmount: form.baseCurAmount, notes }
  }
  return { tradeDate: form.tradeDate, fromSymbol: upper(form.symbol), fromAmount: form.coinAmount, toSymbol: upper(form.toSymbol), toAmount: form.toAmount, notes }
}

const save = useMutation({
  mutationFn: () => cryptoApi.addTrade(props.portfolio.id, buildBody()),
  onSuccess: () => {
    invalidate.portfolios("crypto")
    emit("done")
  },
})

function submit() {
  if (check(createCryptoTradeSchema, buildBody())) save.mutate()
}

// The API describes every trade as "from X to Y"; map its field errors back onto the form's fields.
const err = computed(() => {
  const buy = direction.value === "buy"
  return {
    symbol: buy ? errors.value.toSymbol : errors.value.fromSymbol,
    coinAmount: buy ? errors.value.toAmount : errors.value.fromAmount,
    baseAmount: buy ? errors.value.fromAmount : errors.value.toAmount,
  }
})
</script>

<template>
  <FormCard @submit="submit">
    <TradeKindToggle v-model="direction" :options="DIRECTIONS" />

    <p v-if="direction === 'swap'" class="text-xs text-gray-500 dark:text-gray-400 mb-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 rounded px-3 py-2">
      Cost basis transfers automatically — no P&L is realized at swap time.
    </p>

    <div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
      <Field :label="direction === 'buy' ? 'Symbol' : 'From symbol'" :error="err.symbol">
        <Select v-if="direction !== 'buy' && sellable.length > 0" v-model="form.symbol" required class="w-full">
          <option value="">Select…</option>
          <option v-for="p in sellable" :key="p.symbol" :value="p.symbol">{{ p.symbol }} ({{ fmtSignificant(p.balance, 6) }})</option>
        </Select>
        <Input v-else v-model="form.symbol" required placeholder="BTC" class="w-full" />
      </Field>

      <Field v-if="direction === 'buy'" label="Coin name">
        <Input v-model="form.coinName" placeholder="Bitcoin" class="w-full" />
      </Field>

      <Field :label="direction === 'buy' ? 'Amount received' : 'Amount sold'" :error="err.coinAmount">
        <Input v-model="form.coinAmount" required type="number" step="any" min="0" placeholder="0.5" class="w-full" />
      </Field>

      <template v-if="direction === 'swap'">
        <Field label="To symbol" :error="errors.toSymbol"><Input v-model="form.toSymbol" required placeholder="ETH" class="w-full" /></Field>
        <Field label="Amount received" :error="errors.toAmount">
          <Input v-model="form.toAmount" required type="number" step="any" min="0" placeholder="3.0" class="w-full" />
        </Field>
      </template>

      <Field v-else :label="`${cur} ${direction === 'buy' ? 'paid' : 'received'}`" :error="err.baseAmount">
        <Input v-model="form.baseCurAmount" required type="number" step="any" min="0" placeholder="20000" class="w-full" />
      </Field>

      <Field label="Date" :error="errors.tradeDate"><Input v-model="form.tradeDate" required type="date" class="w-full" /></Field>
      <Field label="Notes"><Input v-model="form.notes" placeholder="Optional" class="w-full" /></Field>
    </div>

    <FormActions submit-label="Save trade" :pending="save.isPending.value" :error="save.error.value" @cancel="emit('done')" />
  </FormCard>
</template>
