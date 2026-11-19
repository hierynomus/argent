<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue"
import { useMutation } from "@tanstack/vue-query"
import { closeDebtPartSchema } from "@argent/shared"
import { debtApis, useInvalidate, usePartCarryOver, type Debt, type DebtKind, type DebtPart } from "../../api"
import { Button, ErrorText, Field, FieldGroup, Input, SegmentedControl } from "../../components/ui"
import { addMonths } from "../../lib/dates"
import { fmtCur, fmtDate } from "../../lib/format"
import { sumCents } from "../../lib/money"
import { useFormErrors } from "../../lib/validate"
import { PART_TYPE_LABELS } from "./config"

/**
 * At the end of a fixed-rate period a part is usually continued: what is left of it becomes one or more new
 * parts (each with its own rate and term), and whatever is not continued is repaid. This closes the part on
 * that day and creates the new ones, starting from the balance the server calculates for it.
 */
const props = defineProps<{ kind: DebtKind; debt: Debt; part: DebtPart }>()
const emit = defineEmits<{ done: [] }>()

const invalidate = useInvalidate()
const { errors, check } = useFormErrors()
const TYPE_OPTIONS = (Object.keys(PART_TYPE_LABELS) as Array<DebtPart["type"]>).map((value) => ({ value, label: PART_TYPE_LABELS[value] }))
const RATE_TYPES = [{ value: "nominal", label: "Nominal" }, { value: "effective", label: "Effective" }] as const
const blank = (name = "") => ({ name, type: "annuity" as DebtPart["type"], principal: "", rate: "", rateType: "nominal" as DebtPart["rateType"], termMonths: "" })

const form = reactive({ closedOn: props.part.nextRateChange?.effectiveDate ?? "", rows: [blank(`${props.part.name} (continued)`)] })
const { data: carry } = usePartCarryOver(props.kind, () => props.debt.id, () => props.part.id, () => form.closedOn)
const balance = computed(() => carry.value?.balance ?? null)

// the first new part starts out as the whole remainder (and follows the balance until it is edited)
const touched = ref(false)
watch(balance, (b) => {
  if (b !== null && !touched.value && form.rows[0]) form.rows[0].principal = b.toFixed(2)
})

const continued = computed(() => sumCents(form.rows.map((r) => parseFloat(r.principal) || 0)))
const repaid = computed(() => (balance.value === null ? null : Math.round((balance.value - continued.value) * 100) / 100))
const addRow = () => form.rows.push(blank())
const removeRow = (i: number) => form.rows.splice(i, 1)

const body = () => ({
  closedOn: form.closedOn,
  continuation: form.rows
    .filter((r) => r.principal !== "" || r.termMonths !== "" || r.rate !== "")
    .map((r) => ({
      name: r.name,
      type: r.type,
      principal: r.principal,
      annualInterestRate: (parseFloat(r.rate) / 100).toFixed(6),
      rateType: r.rateType,
      endDate: addMonths(form.closedOn, parseInt(r.termMonths, 10)),
    })),
})

const save = useMutation({
  mutationFn: () => debtApis[props.kind].closePart(props.debt.id, props.part.id, body()),
  onSuccess: () => {
    invalidate.debts(props.kind)
    emit("done")
  },
})
const submit = () => check(closeDebtPartSchema, body()) && save.mutate()
</script>

<template>
  <div class="px-4 py-3 bg-amber-50/60 dark:bg-amber-950/10 border-t border-gray-100 dark:border-gray-800">
    <p class="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-2">Continue after the fixed-rate period</p>
    <p class="text-xs text-gray-500 dark:text-gray-400 mb-3">
      Closes “{{ part.name }}” on the day its rate period ends and starts the new parts that day. What you do not continue counts as repaid.
    </p>

    <div class="flex flex-wrap items-end gap-3 mb-3">
      <Field label="Closes on" :error="errors.closedOn"><Input v-model="form.closedOn" density="sm" type="date" class="w-36" /></Field>
      <p class="text-sm text-gray-700 dark:text-gray-300 pb-1.5" aria-live="polite">
        <template v-if="balance !== null">Left on {{ fmtDate(form.closedOn) }}: <span class="font-semibold tabular-nums">{{ fmtCur(balance, debt.currency) }}</span></template>
        <template v-else>Pick the day to see what is left.</template>
      </p>
    </div>

    <div v-for="(row, i) in form.rows" :key="i" class="flex flex-wrap items-end gap-2 mb-2" role="group" :aria-label="`New part ${i + 1}`">
      <Field label="Name"><Input v-model="row.name" density="sm" type="text" class="w-40" /></Field>
      <FieldGroup label="Type"><SegmentedControl v-model="row.type" :options="TYPE_OPTIONS" padding="px-2 py-1" /></FieldGroup>
      <Field :label="`Amount (${debt.currency})`"><Input v-model="row.principal" density="sm" type="number" min="0" step="0.01" class="w-32" @input="touched = true" /></Field>
      <Field label="Rate (%/yr)"><Input v-model="row.rate" density="sm" type="number" min="0" step="0.001" placeholder="e.g. 4.10" class="w-24" /></Field>
      <FieldGroup label="Rate is"><SegmentedControl v-model="row.rateType" :options="RATE_TYPES" padding="px-2 py-1" /></FieldGroup>
      <Field label="Term (months)"><Input v-model="row.termMonths" density="sm" type="number" min="1" step="1" placeholder="e.g. 120" class="w-28" /></Field>
      <Button v-if="form.rows.length > 1" variant="danger-link" size="xs" @click="removeRow(i)">Remove</Button>
    </div>
    <ErrorText v-if="errors.continuation" :error="errors.continuation" />

    <div class="flex flex-wrap items-center gap-4 mt-3">
      <Button variant="link" size="xs" @click="addRow">+ Split into another part</Button>
      <p v-if="repaid !== null" class="text-sm" :class="repaid < 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-600 dark:text-gray-400'">
        <template v-if="repaid < 0">The new parts are {{ fmtCur(-repaid, debt.currency) }} more than what is left.</template>
        <template v-else>Repaid from savings: <span class="font-semibold tabular-nums">{{ fmtCur(repaid, debt.currency) }}</span></template>
      </p>
    </div>

    <div class="flex gap-2 mt-3">
      <Button :disabled="!form.closedOn || save.isPending.value || (repaid !== null && repaid < 0)" @click="submit">{{ save.isPending.value ? "Saving…" : "Close and continue" }}</Button>
      <Button variant="secondary" @click="emit('done')">Cancel</Button>
    </div>
    <ErrorText :error="save.error.value" />
  </div>
</template>
