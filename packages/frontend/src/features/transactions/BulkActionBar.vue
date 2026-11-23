<script setup lang="ts">
import { computed, ref } from "vue"
import { useMutation } from "@tanstack/vue-query"
import type { Category, TransactionWithDetails } from "@argent/shared"
import { createSubscription, updateTransaction, useInvalidate } from "../../api"
import { Button, ErrorText, Input, Select, vFocus } from "../../components/ui"
import { subscriptionTargetOf } from "./bulk"

/** Floating bar shown while rows are selected: apply a label to all of them, or turn them into a subscription. */
const props = defineProps<{ rows: TransactionWithDetails[]; selectedIds: ReadonlySet<string>; labels: Category[] }>()
const emit = defineEmits<{ clear: []; subscriptionCreated: [] }>()

const invalidate = useInvalidate()
const labelId = ref("")
const creatingSub = ref(false)
const subName = ref("")

const target = computed(() => subscriptionTargetOf(props.rows, props.selectedIds))

const applyLabel = useMutation({
  mutationFn: async () => {
    for (const id of props.selectedIds) await updateTransaction(id, { categoryId: labelId.value || null })
  },
  onSuccess: () => {
    invalidate.transactions()
    emit("clear")
  },
})

const createSub = useMutation({
  mutationFn: () => createSubscription({ accountId: target.value!.accountId, counterpartyIban: target.value!.counterpartyIban, name: subName.value.trim() || undefined }),
  onSuccess: () => {
    creatingSub.value = false
    subName.value = ""
    emit("clear")
    emit("subscriptionCreated")
  },
})
</script>

<template>
  <div v-if="selectedIds.size > 0" class="fixed bottom-6 left-1/2 -translate-x-1/2 z-30 flex flex-col gap-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl px-5 py-3">
    <div class="flex items-center gap-3">
      <template v-if="creatingSub && target">
        <span class="text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">↻ {{ target.counterpartyName ?? target.counterpartyIban }}</span>
        <Input
          v-model="subName"
          v-focus
          density="sm"
          type="text"
          placeholder="Name (optional)"
          aria-label="Subscription name"
          class="py-1.5! w-40"
          @keydown.enter="createSub.mutate()"
          @keydown.esc="creatingSub = false"
        />
        <Button size="sm" class="rounded-md" :disabled="createSub.isPending.value" @click="createSub.mutate()">{{ createSub.isPending.value ? "Creating…" : "Create" }}</Button>
        <Button variant="muted-link" size="sm" class="px-2!" @click="creatingSub = false">Cancel</Button>
      </template>
      <template v-else>
        <span class="text-sm font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">{{ selectedIds.size }} selected</span>
        <Select v-model="labelId" density="sm" aria-label="Label to apply" class="py-1.5!">
          <option value="">Unlabeled</option>
          <option v-for="l in labels" :key="l.id" :value="l.id">{{ l.name }}</option>
        </Select>
        <Button size="sm" class="rounded-md" :disabled="applyLabel.isPending.value" @click="applyLabel.mutate()">{{ applyLabel.isPending.value ? "Applying…" : "Apply label" }}</Button>
        <template v-if="target">
          <div class="w-px h-5 bg-gray-200 dark:bg-gray-700 shrink-0" />
          <Button variant="secondary" class="rounded-md whitespace-nowrap font-medium" @click="creatingSub = true">↻ Create subscription</Button>
        </template>
        <Button variant="muted-link" size="sm" class="px-2!" @click="emit('clear')">Clear</Button>
      </template>
    </div>
    <ErrorText :error="applyLabel.error.value ?? createSub.error.value" />
  </div>
</template>
