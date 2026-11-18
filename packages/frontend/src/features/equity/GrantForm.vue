<script setup lang="ts">
import { reactive, watch } from "vue"
import { useMutation } from "@tanstack/vue-query"
import { createEquityGrantSchema, type CreateEquityGrantBody, type EquityGrantWithState, type VestingType } from "@argent/shared"
import { equityApi, useInvalidate } from "../../api"
import { Button, ErrorText, Field, FieldGroup, Input, SegmentedControl, vFocus } from "../../components/ui"
import { useFormErrors } from "../../lib/validate"

/**
 * Add a grant, or correct one (`grant` given). A grant vests either over time (a start, an optional cliff and a
 * total period, monthly) or only on an exit. A mix is simply two grants.
 */
const props = defineProps<{ planId: string; grant?: EquityGrantWithState }>()
const emit = defineEmits<{ done: [] }>()
const invalidate = useInvalidate()
const { errors, check } = useFormErrors()

const g = props.grant
const form = reactive({
  label: g?.label ?? "",
  grantDate: g?.grantDate ?? "",
  options: g ? String(parseFloat(g.options)) : "",
  strikePrice: g ? String(parseFloat(g.strikePrice)) : "",
  vestingType: (g?.vestingType ?? "time") as VestingType,
  vestStart: g?.vestStart ?? "",
  cliffMonths: g ? String(g.cliffMonths) : "12",
  vestMonths: g?.vestMonths ? String(g.vestMonths) : "48",
})
const TYPES = [{ value: "time", label: "Over time" }, { value: "exit", label: "On exit" }] as const

// vesting normally starts on the grant date: follow it until the start has been set by hand
let startTouched = !!g?.vestStart
watch(() => form.grantDate, (d) => { if (!startTouched) form.vestStart = d })

const body = (): CreateEquityGrantBody => ({
  ...(form.label.trim() ? { label: form.label.trim() } : {}),
  grantDate: form.grantDate,
  options: form.options,
  strikePrice: form.strikePrice,
  vestingType: form.vestingType,
  ...(form.vestingType === "time"
    ? {
        ...(form.vestStart ? { vestStart: form.vestStart } : {}),
        cliffMonths: form.cliffMonths === "" ? 0 : Number(form.cliffMonths),
        ...(form.vestMonths === "" ? {} : { vestMonths: Number(form.vestMonths) }),
      }
    : {}),
})

const save = useMutation({
  mutationFn: () => (props.grant ? equityApi.updateGrant(props.planId, props.grant.id, body()) : equityApi.addGrant(props.planId, body())),
  onSuccess: () => {
    invalidate.equity()
    emit("done")
  },
})
const submit = () => check(createEquityGrantSchema, body()) && save.mutate()
</script>

<template>
  <form class="space-y-3 pb-3 mb-3 border-b border-gray-100 dark:border-gray-800" novalidate @submit.prevent="submit">
    <p class="text-sm font-medium text-gray-700 dark:text-gray-300">{{ grant ? "Edit grant" : "Add grant" }}</p>
    <div class="flex flex-wrap gap-3 items-end">
      <Field label="Label (optional)"><Input v-model="form.label" v-focus density="sm" type="text" placeholder="e.g. 2023 grant" class="w-40" /></Field>
      <Field label="Grant date" :error="errors.grantDate"><Input v-model="form.grantDate" density="sm" type="date" class="w-36" /></Field>
      <Field label="Options" :error="errors.options"><Input v-model="form.options" density="sm" type="number" min="0" step="any" placeholder="4800" class="w-28" /></Field>
      <Field label="Strike price" :error="errors.strikePrice"><Input v-model="form.strikePrice" density="sm" type="number" min="0" step="any" placeholder="2.00" class="w-28" /></Field>
      <FieldGroup label="Vests"><SegmentedControl v-model="form.vestingType" :options="TYPES" padding="px-3 py-1" /></FieldGroup>
    </div>
    <div v-if="form.vestingType === 'time'" class="flex flex-wrap gap-3 items-end">
      <Field label="Vesting starts" :error="errors.vestStart"><Input v-model="form.vestStart" density="sm" type="date" class="w-36" @input="startTouched = true" /></Field>
      <Field label="Cliff (months)" :error="errors.cliffMonths"><Input v-model="form.cliffMonths" density="sm" type="number" min="0" step="1" class="w-24" /></Field>
      <Field label="Fully vested after (months)" :error="errors.vestMonths"><Input v-model="form.vestMonths" density="sm" type="number" min="1" step="1" class="w-28" /></Field>
    </div>
    <p v-else class="text-xs text-gray-500 dark:text-gray-400">These options only become payable on an exit, so they are shown as "on exit" and do not count in your net worth.</p>
    <div class="flex gap-2">
      <Button type="submit" size="sm" :disabled="save.isPending.value">{{ save.isPending.value ? "Saving…" : grant ? "Save grant" : "Add grant" }}</Button>
      <Button variant="muted-link" size="sm" class="!px-2" @click="emit('done')">Cancel</Button>
    </div>
    <ErrorText :error="save.error.value" />
  </form>
</template>
