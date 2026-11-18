<script setup lang="ts">
import { reactive, ref } from "vue"
import { useMutation } from "@tanstack/vue-query"
import { updateEquityPlanSchema, type EquityPlanWithDetails } from "@argent/shared"
import { equityApi, useInvalidate } from "../../api"
import { Button, Card, ErrorText, Field, Input, vFocus } from "../../components/ui"
import { fmtDate, fmtMaxDecimals, fmtPrice, fmtSymbolCur } from "../../lib/format"
import { useFormErrors } from "../../lib/validate"
import GrantsTable from "./GrantsTable.vue"
import PlanActions from "./PlanActions.vue"
import PriceHistory from "./PriceHistory.vue"

/** One company: the share price, what has vested, what is on exit, and the grants and prices behind it. */
const props = defineProps<{ plan: EquityPlanWithDetails }>()
const invalidate = useInvalidate()
const renaming = ref(false)
const { errors, check } = useFormErrors()
const form = reactive({ name: props.plan.name })
const rename = useMutation({
  mutationFn: () => equityApi.update(props.plan.id, { name: form.name }),
  onSuccess: () => {
    invalidate.equity()
    renaming.value = false
  },
})
const submitRename = () => check(updateEquityPlanSchema, { name: form.name }) && rename.mutate()

const money = (n: number | null) => (n === null ? "—" : fmtSymbolCur(n, props.plan.currency))
const count = (n: number) => fmtMaxDecimals(n, 2)
</script>

<template>
  <Card class="overflow-hidden" :aria-label="plan.name" role="region">
    <div class="px-6 py-5">
      <div class="flex items-start justify-between gap-4 flex-wrap mb-4">
        <h2 class="text-lg font-semibold text-gray-900 dark:text-gray-100">{{ plan.name }}</h2>
        <Button v-if="plan.canEdit" variant="link" size="xs" @click="renaming = !renaming">{{ renaming ? "Close" : "Rename" }}</Button>
      </div>
      <form v-if="renaming" class="flex gap-3 items-end pb-3 mb-3 border-b border-gray-100 dark:border-gray-800" novalidate @submit.prevent="submitRename">
        <Field label="Company" :error="errors.name"><Input v-model="form.name" v-focus density="sm" type="text" class="w-56" /></Field>
        <Button type="submit" size="sm" :disabled="rename.isPending.value">Save</Button>
        <ErrorText :error="rename.error.value" />
      </form>

      <dl class="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div>
          <dt class="text-xs text-gray-400 dark:text-gray-500">Share price</dt>
          <dd class="text-xl font-bold text-gray-900 dark:text-gray-100 tabular-nums">{{ plan.currentPrice !== null ? fmtPrice(plan.currentPrice, plan.currency) : "—" }}</dd>
          <dd class="text-xs text-gray-400 dark:text-gray-500">{{ plan.currentPriceDate ? `as of ${fmtDate(plan.currentPriceDate)}` : "no price yet" }}</dd>
        </div>
        <div>
          <dt class="text-xs text-gray-400 dark:text-gray-500">Vested</dt>
          <dd class="text-xl font-bold text-green-600 dark:text-green-400 tabular-nums">{{ money(plan.totals.vestedValue) }}</dd>
          <dd class="text-xs text-gray-400 dark:text-gray-500">{{ count(plan.totals.vested) }} options · counts in net worth</dd>
        </div>
        <div>
          <dt class="text-xs text-gray-400 dark:text-gray-500">Still vesting</dt>
          <dd class="text-xl font-bold text-gray-900 dark:text-gray-100 tabular-nums">{{ money(plan.totals.unvestedValue) }}</dd>
          <dd class="text-xs text-gray-400 dark:text-gray-500">{{ count(plan.totals.unvested) }} options</dd>
        </div>
        <div>
          <dt class="text-xs text-gray-400 dark:text-gray-500">On exit</dt>
          <dd class="text-xl font-bold text-gray-900 dark:text-gray-100 tabular-nums">{{ money(plan.totals.onExitValue) }}</dd>
          <dd class="text-xs text-gray-400 dark:text-gray-500">{{ count(plan.totals.onExit) }} options · not counted</dd>
        </div>
      </dl>
      <p class="text-xs text-gray-400 dark:text-gray-500 mt-3">Values are before tax: options × (share price − strike). They are only paid out on an exit.</p>

      <div class="mt-5"><GrantsTable :plan="plan" /></div>
      <div class="mt-5"><PriceHistory :plan="plan" /></div>
      <PlanActions v-if="plan.isOwner" :plan="plan" />
    </div>
  </Card>
</template>
