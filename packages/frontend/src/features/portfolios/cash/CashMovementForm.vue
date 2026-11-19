<script setup lang="ts">
import { reactive } from "vue"
import { useMutation } from "@tanstack/vue-query"
import { createCashMovementSchema, type CashMovementType, type PortfolioDetail, type StockPortfolioDetail } from "@argent/shared"
import { portfolioApis, useInvalidate } from "../../../api"
import { Field, Input, Select } from "../../../components/ui"
import { useFormErrors } from "../../../lib/validate"
import FormActions from "../FormActions.vue"
import FormCard from "../FormCard.vue"
import { CASH_TYPE_LABELS } from "./config"

/** Records money moved into or out of the portfolio's cash account, or a fee/interest charged on it. */
const props = defineProps<{ kind: "crypto" | "stocks"; portfolio: PortfolioDetail | StockPortfolioDetail }>()
const emit = defineEmits<{ done: [] }>()

const invalidate = useInvalidate()
const { errors, check } = useFormErrors()
const form = reactive({ type: "deposit" as CashMovementType, amount: "", movementDate: "", notes: "" })
const body = () => ({ type: form.type, amount: form.amount, movementDate: form.movementDate, notes: form.notes.trim() || undefined })

const save = useMutation({
  mutationFn: () => portfolioApis[props.kind].addCash(props.portfolio.id, body()),
  onSuccess: () => {
    invalidate.portfolios(props.kind)
    emit("done")
  },
})
const submit = () => check(createCashMovementSchema, body()) && save.mutate()
</script>

<template>
  <FormCard novalidate @submit="submit">
    <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <Field label="Type" :error="errors.type">
        <Select v-model="form.type" class="w-full">
          <option v-for="(label, value) in CASH_TYPE_LABELS" :key="value" :value="value">{{ label }}</option>
        </Select>
      </Field>
      <Field :label="`Amount (${portfolio.currency})`" :error="errors.amount">
        <Input v-model="form.amount" type="number" step="any" min="0" placeholder="1000.00" class="w-full" />
      </Field>
      <Field label="Date" :error="errors.movementDate"><Input v-model="form.movementDate" type="date" class="w-full" /></Field>
      <Field label="Notes"><Input v-model="form.notes" placeholder="Optional" class="w-full" /></Field>
    </div>
    <FormActions submit-label="Save" :pending="save.isPending.value" :error="save.error.value" @cancel="emit('done')" />
  </FormCard>
</template>
