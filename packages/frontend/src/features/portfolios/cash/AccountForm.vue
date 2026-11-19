<script setup lang="ts">
import { reactive } from "vue"
import { useMutation } from "@tanstack/vue-query"
import { updatePortfolioSchema, type PortfolioDetail, type StockPortfolioDetail } from "@argent/shared"
import { portfolioApis, useInvalidate } from "../../../api"
import { Field, Input } from "../../../components/ui"
import { useFormErrors } from "../../../lib/validate"
import FormActions from "../FormActions.vue"
import FormCard from "../FormCard.vue"

/** The cash account behind a portfolio: its number (IBAN or broker account id) and the cash it held on a date. */
const props = defineProps<{ kind: "crypto" | "stocks"; portfolio: PortfolioDetail | StockPortfolioDetail }>()
const emit = defineEmits<{ done: [] }>()

const invalidate = useInvalidate()
const { errors, check } = useFormErrors()
const form = reactive({
  accountNumber: props.portfolio.accountNumber ?? "",
  openingCash: Number(props.portfolio.openingCash ?? 0) === 0 ? "" : String(props.portfolio.openingCash),
  openingCashDate: props.portfolio.openingCashDate ?? "",
})
const body = () => ({
  accountNumber: form.accountNumber.trim() || null,
  openingCash: form.openingCash.trim() || "0",
  openingCashDate: form.openingCashDate || null,
})

const save = useMutation({
  mutationFn: () => portfolioApis[props.kind].update(props.portfolio.id, body()),
  onSuccess: () => {
    invalidate.portfolios(props.kind)
    emit("done")
  },
})
const submit = () => check(updatePortfolioSchema, body()) && save.mutate()
</script>

<template>
  <FormCard novalidate @submit="submit">
    <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <Field label="Account number" :error="errors.accountNumber"><Input v-model="form.accountNumber" placeholder="IBAN or broker account id" class="w-full" /></Field>
      <Field :label="`Cash on that date (${portfolio.currency})`" :error="errors.openingCash">
        <Input v-model="form.openingCash" type="number" step="any" min="0" placeholder="0.00" class="w-full" />
      </Field>
      <Field label="Cash as of" :error="errors.openingCashDate"><Input v-model="form.openingCashDate" type="date" class="w-full" /></Field>
    </div>
    <p class="text-xs text-gray-400 dark:text-gray-500 mt-2">
      Optional. If the account already held money, enter it with the date: deposits, trades and dividends from that date on are added to it.
    </p>
    <FormActions submit-label="Save" :pending="save.isPending.value" :error="save.error.value" @cancel="emit('done')" />
  </FormCard>
</template>
