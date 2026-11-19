<script setup lang="ts">
import { computed } from "vue"
import type { PreviewDebtPartBody } from "@argent/shared"
import { useDebtPartPreview, type DebtKind } from "../../api"
import { fmtCur, fmtDate } from "../../lib/format"
import { useDebounced } from "../../lib/debounced"

/**
 * What the part being entered comes to, computed by the server like a saved part: the balance today, the
 * installment and the term. It lets you check the numbers against the bank's statement before saving.
 * `body` is null while the form is incomplete or invalid.
 */
const props = defineProps<{ kind: DebtKind; currency: string; body: PreviewDebtPartBody | null }>()

const settled = useDebounced(() => props.body, 400)
const { data: preview, isError } = useDebtPartPreview(props.kind, settled)
const cur = (n: number) => fmtCur(n, props.currency)
const rows = computed(() => {
  const p = preview.value
  if (!p) return []
  return [
    { label: "Balance today", value: cur(p.currentBalance) },
    { label: "Monthly payment", value: cur(p.monthlyPayment), note: `${cur(p.monthlyInterest)} interest + ${cur(p.monthlyPrincipal)} principal` },
    { label: "Payments", value: `${p.totalMonths}`, note: `${p.monthsElapsed} due so far, ${p.monthsRemaining} to go` },
    { label: "Last payment", value: fmtDate(p.projectedEndDate) },
  ]
})
</script>

<template>
  <div class="mt-3 rounded-lg border border-dashed border-gray-300 dark:border-gray-600 px-4 py-3" aria-label="Preview of this part" role="group">
    <p class="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-2">Preview</p>
    <p v-if="!body && !preview" class="text-sm text-gray-400 dark:text-gray-500">Fill in the principal, rate, start date and term to see what this comes to.</p>
    <p v-else-if="isError && !preview" class="text-sm text-red-600 dark:text-red-400">The preview could not be calculated.</p>
    <dl v-else class="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4" :class="!body && 'opacity-50'">
      <div v-for="r in rows" :key="r.label">
        <dt class="text-xs text-gray-400 dark:text-gray-500">{{ r.label }}</dt>
        <dd class="text-sm font-semibold tabular-nums text-gray-900 dark:text-gray-100">{{ r.value }}</dd>
        <dd v-if="r.note" class="text-xs text-gray-400 dark:text-gray-500">{{ r.note }}</dd>
      </div>
    </dl>
    <p v-if="preview && preview.capitalizedInterest > 0" class="text-xs text-gray-500 dark:text-gray-400 mt-2">
      Includes {{ cur(preview.capitalizedInterest) }} interest for the partial first month, added to the loan.
    </p>
  </div>
</template>
