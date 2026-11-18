<script setup lang="ts">
import { computed, reactive } from "vue"
import { useMutation } from "@tanstack/vue-query"
import { createStockDividendSchema, type StockPortfolioDetail } from "@argent/shared"
import { stocksApi, useInvalidate } from "../../../api"
import { Field, Input, Select } from "../../../components/ui"
import { useFormErrors } from "../../../lib/validate"
import FormActions from "../FormActions.vue"
import FormCard from "../FormCard.vue"

/** Records a dividend payment. Dividends are income only: they don't change cost basis. */
const props = defineProps<{ portfolio: StockPortfolioDetail }>()
const emit = defineEmits<{ done: [] }>()

const invalidate = useInvalidate()
const { errors, check } = useFormErrors()
const form = reactive({ symbol: "", paymentDate: "", amount: "", notes: "" })
const held = computed(() => props.portfolio.positions.filter((p) => p.balance > 1e-10))

const body = () => ({ symbol: form.symbol.toUpperCase().trim(), paymentDate: form.paymentDate, amount: form.amount, notes: form.notes.trim() || undefined })

const save = useMutation({
  mutationFn: () => stocksApi.addDividend(props.portfolio.id, body()),
  onSuccess: () => {
    invalidate.portfolios("stocks")
    emit("done")
  },
})

function submit() {
  if (check(createStockDividendSchema, body())) save.mutate()
}
</script>

<template>
  <FormCard @submit="submit">
    <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <Field label="Symbol" :error="errors.symbol">
        <Select v-if="held.length > 0" v-model="form.symbol" required class="w-full">
          <option value="">Select…</option>
          <option v-for="p in held" :key="p.symbol" :value="p.symbol">{{ p.symbol }}</option>
        </Select>
        <Input v-else v-model="form.symbol" required placeholder="AAPL" class="w-full" />
      </Field>
      <Field :label="`${portfolio.currency} received`" :error="errors.amount">
        <Input v-model="form.amount" required type="number" step="any" min="0" placeholder="25.00" class="w-full" />
      </Field>
      <Field label="Payment date" :error="errors.paymentDate"><Input v-model="form.paymentDate" required type="date" class="w-full" /></Field>
      <Field label="Notes"><Input v-model="form.notes" placeholder="Optional" class="w-full" /></Field>
    </div>
    <FormActions submit-label="Save dividend" :pending="save.isPending.value" :error="save.error.value" @cancel="emit('done')" />
  </FormCard>
</template>
