<script setup lang="ts">
import { computed, reactive } from "vue"
import { useMutation } from "@tanstack/vue-query"
import { createPensionTransferSchema, type CreatePensionTransferBody, type PensionPlanWithDetails } from "@argent/shared"
import { pensionsApi, useInvalidate } from "../../api"
import { Button, ErrorText, Field, Input, SegmentedControl, Select, vFocus } from "../../components/ui"
import { useFormErrors } from "../../lib/validate"

/**
 * Move this plan's value or rights to another plan: a job change (a value transfer) or the switch of a fund to
 * the new pension system (a conversion). The old plan is closed on that date, unless it is merely frozen.
 */
const props = defineProps<{ plan: PensionPlanWithDetails; plans: PensionPlanWithDetails[] }>()
const emit = defineEmits<{ done: [] }>()
const invalidate = useInvalidate()
const { errors, check } = useFormErrors()
const targets = computed(() => props.plans.filter((p) => p.id !== props.plan.id && p.canEdit && p.state !== "closed"))
const form = reactive({
  toPlanId: targets.value[0]?.id ?? "",
  kind: "transfer" as "transfer" | "conversion",
  transferDate: new Date().toISOString().slice(0, 10),
  capital: "", incomeGivenUp: "", note: "", closeFrom: true,
})
const KINDS = [{ value: "transfer", label: "Value transfer" }, { value: "conversion", label: "Conversion" }] as const
const body = (): CreatePensionTransferBody => ({
  fromPlanId: props.plan.id,
  toPlanId: form.toPlanId,
  transferDate: form.transferDate,
  kind: form.kind,
  ...(form.capital.trim() ? { capital: form.capital.trim() } : {}),
  ...(form.incomeGivenUp.trim() ? { incomeGivenUp: form.incomeGivenUp.trim() } : {}),
  ...(form.note.trim() ? { note: form.note.trim() } : {}),
  closeFrom: form.closeFrom,
})
const save = useMutation({
  mutationFn: () => pensionsApi.addTransfer(body()),
  onSuccess: () => {
    invalidate.pensions()
    emit("done")
  },
})
const submit = () => check(createPensionTransferSchema, body()) && save.mutate()
</script>

<template>
  <p v-if="targets.length === 0" class="text-sm text-gray-500 dark:text-gray-400 py-2">
    Add the plan the value moves to first (for a job change or a conversion, the new plan), then come back here.
    <Button variant="muted-link" size="sm" class="px-2!" @click="emit('done')">Close</Button>
  </p>
  <form v-else class="space-y-3 my-3" novalidate @submit.prevent="submit">
    <div class="flex flex-wrap gap-3 items-end">
      <Field label="Moves to" :error="errors.toPlanId">
        <Select v-model="form.toPlanId" v-focus><option v-for="p in targets" :key="p.id" :value="p.id">{{ p.name }}</option></Select>
      </Field>
      <Field label="What happened"><SegmentedControl v-model="form.kind" :options="KINDS" padding="px-3 py-1.5 font-medium" /></Field>
      <Field label="Date" :error="errors.transferDate"><Input v-model="form.transferDate" density="sm" type="date" class="w-36" /></Field>
    </div>
    <div class="flex flex-wrap gap-3 items-end">
      <Field :label="`Value that arrived (${plan.currency}, optional)`" :error="errors.capital"><Input v-model="form.capital" density="sm" type="number" min="0" step="any" class="w-40" /></Field>
      <Field label="Yearly income given up (optional)" :error="errors.incomeGivenUp"><Input v-model="form.incomeGivenUp" density="sm" type="number" min="0" step="any" class="w-40" /></Field>
      <Field label="Note (optional)" :error="errors.note"><Input v-model="form.note" density="sm" type="text" class="w-48" /></Field>
    </div>
    <label class="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
      <input v-model="form.closeFrom" type="checkbox" class="w-4 h-4 accent-indigo-600" /> Close {{ plan.name }} on this date
    </label>
    <div class="flex gap-3 items-center">
      <Button type="submit" size="sm" :disabled="!form.toPlanId || save.isPending.value">{{ save.isPending.value ? "Saving…" : "Record transfer" }}</Button>
      <Button variant="muted-link" size="sm" class="px-2!" @click="emit('done')">Cancel</Button>
    </div>
    <ErrorText :error="save.error.value" />
  </form>
</template>
