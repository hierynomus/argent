<script setup lang="ts">
import { ref } from "vue"
import { useMutation } from "@tanstack/vue-query"
import type { PensionPlanWithDetails, UpdatePensionPlanBody } from "@argent/shared"
import { pensionsApi, useInvalidate } from "../../api"
import { Button, ErrorText, Field, Input, vFocus } from "../../components/ui"
import TransferForm from "./TransferForm.vue"

/** What can happen to a plan: freeze it, close it (converted, transferred, paid out), reopen it, move it, count it or not. */
const props = defineProps<{ plan: PensionPlanWithDetails; plans: PensionPlanWithDetails[] }>()
const invalidate = useInvalidate()
const mode = ref<"close" | "move" | null>(null)
const closedOn = ref(new Date().toISOString().slice(0, 10))

const update = useMutation({
  mutationFn: (body: UpdatePensionPlanBody) => pensionsApi.update(props.plan.id, body),
  onSuccess: () => {
    invalidate.pensions()
    mode.value = null
  },
})
</script>

<template>
  <div v-if="plan.canEdit" class="mt-4 pt-3 border-t border-gray-100 dark:border-gray-800 space-y-3">
    <div class="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
      <template v-if="plan.state === 'closed'">
        <Button variant="link" size="xs" :disabled="update.isPending.value" @click="update.mutate({ closedOn: null })">Reopen</Button>
      </template>
      <template v-else>
        <Button variant="link" size="xs" :disabled="update.isPending.value" @click="update.mutate({ status: plan.status === 'frozen' ? 'active' : 'frozen' })">
          {{ plan.status === "frozen" ? "Mark as active" : "Mark as frozen" }}
        </Button>
        <Button variant="link" size="xs" @click="mode = mode === 'move' ? null : 'move'">Move to another plan…</Button>
        <Button variant="link" size="xs" @click="mode = mode === 'close' ? null : 'close'">Close plan…</Button>
      </template>
      <label class="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
        <input type="checkbox" class="w-4 h-4 accent-indigo-600" :checked="plan.countInNetWorth" @change="update.mutate({ countInNetWorth: ($event.target as HTMLInputElement).checked })" />
        Count the pot in net worth
      </label>
    </div>

    <form v-if="mode === 'close'" class="flex flex-wrap gap-3 items-end" @submit.prevent="update.mutate({ closedOn })">
      <Field label="Closed on"><Input v-model="closedOn" v-focus density="sm" type="date" class="w-36" /></Field>
      <Button type="submit" size="sm" :disabled="!closedOn || update.isPending.value">Close plan</Button>
      <Button variant="muted-link" size="sm" class="px-2!" @click="mode = null">Cancel</Button>
      <p class="basis-full text-xs text-gray-400 dark:text-gray-500">A closed plan keeps its history but no longer counts. Use “Move to another plan” if its value went somewhere.</p>
    </form>
    <TransferForm v-if="mode === 'move'" :plan="plan" :plans="plans" @done="mode = null" />
    <ErrorText :error="update.error.value" />
  </div>
</template>
