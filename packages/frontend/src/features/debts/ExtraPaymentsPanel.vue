<script setup lang="ts">
import { reactive } from "vue"
import { useMutation } from "@tanstack/vue-query"
import { createDebtExtraPaymentSchema } from "@argent/shared"
import { debtApis, useInvalidate, type Debt, type DebtKind, type DebtPart } from "../../api"
import { Button, ErrorText, Field, FieldGroup, Input, SegmentedControl } from "../../components/ui"
import { fmtCur } from "../../lib/format"
import { useFormErrors } from "../../lib/validate"
import { DEBT_KINDS } from "./config"
import ExtraSavings from "./ExtraSavings.vue"

/** The extra (early) repayments of one part: list, remove, and a form to record another. */
const props = defineProps<{ kind: DebtKind; debt: Debt; part: DebtPart; canEdit: boolean }>()

const invalidate = useInvalidate()
const { errors, check } = useFormErrors()
const EFFECTS = [{ value: "shorten_term", label: "Shorten the term" }, { value: "lower_payment", label: "Lower the payment" }] as const
const EFFECT_LABELS = { shorten_term: "Shortens the term", lower_payment: "Lowers the payment" } as const
const form = reactive({ paymentDate: "", amount: "", notes: "", effect: "shorten_term" as "shorten_term" | "lower_payment" })
// an interest-only part has no installment to lower: the choice only exists for the others
const choosesEffect = () => props.part.type !== "interest_only"
const body = () => ({ paymentDate: form.paymentDate, amount: form.amount, effect: choosesEffect() ? form.effect : undefined, notes: form.notes || undefined })

const add = useMutation({
  mutationFn: () => debtApis[props.kind].addExtraPayment(props.debt.id, props.part.id, body()),
  onSuccess: () => {
    invalidate.debts(props.kind)
    Object.assign(form, { paymentDate: "", amount: "", notes: "" })
  },
})
const remove = useMutation({
  mutationFn: (paymentId: string) => debtApis[props.kind].removeExtraPayment(props.debt.id, props.part.id, paymentId),
  onSuccess: () => invalidate.debts(props.kind),
})
</script>

<template>
  <div class="px-4 py-3 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-100 dark:border-gray-800">
    <p class="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-2">Extra payments</p>

    <ExtraSavings v-if="part.extraImpact" :impact="part.extraImpact" :currency="debt.currency" />
    <p v-if="part.extraPayments.length === 0" class="text-xs text-gray-400 dark:text-gray-500 mb-3">No extra payments recorded.</p>
    <table v-else class="w-full text-sm mb-3">
      <tbody class="divide-y divide-gray-100 dark:divide-gray-700">
        <tr v-for="ep in part.extraPayments" :key="ep.id">
          <td class="py-1.5 pr-4 text-gray-500 dark:text-gray-400 w-28 whitespace-nowrap">{{ ep.paymentDate }}</td>
          <td class="py-1.5 pr-4 font-medium text-gray-800 dark:text-gray-200 tabular-nums">{{ fmtCur(parseFloat(ep.amount), debt.currency) }}</td>
          <td class="py-1.5 pr-4 text-gray-500 dark:text-gray-400 text-xs">
            <span v-if="choosesEffect()" class="mr-2 text-gray-400 dark:text-gray-500">{{ EFFECT_LABELS[ep.effect ?? "shorten_term"] }}</span>{{ ep.notes ?? "" }}
          </td>
          <td v-if="canEdit" class="py-1.5 text-right">
            <Button variant="danger-link" size="xs" @click="remove.mutate(ep.id)">Remove</Button>
          </td>
        </tr>
      </tbody>
    </table>

    <div v-if="canEdit" class="flex gap-2 flex-wrap items-end">
      <Field label="Date" :error="errors.paymentDate">
        <Input v-model="form.paymentDate" density="sm" type="date" class="w-36" />
      </Field>
      <Field :label="`Amount (${debt.currency})`" :error="errors.amount">
        <Input v-model="form.amount" density="sm" type="number" min="0" step="0.01" placeholder="0.00" class="w-32" />
      </Field>
      <FieldGroup v-if="choosesEffect()" label="The extra payment">
        <SegmentedControl v-model="form.effect" :options="EFFECTS" padding="px-2 py-1" />
      </FieldGroup>
      <Field label="Notes (optional)">
        <Input v-model="form.notes" density="sm" type="text" :placeholder="DEBT_KINDS[kind].paymentNotesPlaceholder" class="w-44" />
      </Field>
      <Button :disabled="!form.paymentDate || !form.amount || add.isPending.value" @click="check(createDebtExtraPaymentSchema, body()) && add.mutate()">Add</Button>
    </div>
    <ErrorText :error="add.error.value ?? remove.error.value" />
  </div>
</template>
