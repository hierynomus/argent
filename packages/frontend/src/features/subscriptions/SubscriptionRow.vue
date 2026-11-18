<script setup lang="ts">
import { ref } from "vue"
import { useMutation } from "@tanstack/vue-query"
import type { Subscription } from "@argent/shared"
import { deleteSubscription, updateSubscription, useInvalidate } from "../../api"
import { Button, Card, ConfirmButton, ErrorText, Input, vFocus } from "../../components/ui"
import { fmtBalance } from "../../lib/format"
import LinkedTransactions from "./LinkedTransactions.vue"

/** A confirmed subscription: amount, interval, next payment; rename, (de)activate, delete; expand for its payments. */
const props = defineProps<{ sub: Subscription }>()
const invalidate = useInvalidate()
const expanded = ref(false)
const editing = ref(false)
const nameInput = ref(props.sub.name ?? "")

const update = useMutation({
  mutationFn: (changes: { name?: string; isActive?: boolean }) => updateSubscription(props.sub.id, changes),
  onSuccess: () => invalidate.subscriptions(),
})
const remove = useMutation({ mutationFn: () => deleteSubscription(props.sub.id), onSuccess: () => invalidate.subscriptions() })

const saveName = () => update.mutate({ name: nameInput.value }, { onSuccess: () => (editing.value = false) })
function startEdit() {
  nameInput.value = props.sub.name ?? ""
  editing.value = true
}
</script>

<template>
  <Card class="overflow-hidden">
    <div class="px-5 py-4 flex items-center gap-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50" @click="expanded = !expanded">
      <div class="flex-1 min-w-0">
        <div v-if="editing" class="flex items-center gap-2" @click.stop>
          <Input
            v-model="nameInput"
            v-focus
            density="sm"
            type="text"
            placeholder="Subscription name…"
            aria-label="Subscription name"
            class="w-56 border-indigo-300 dark:border-indigo-600"
            @keydown.enter="saveName"
            @keydown.esc="editing = false"
          />
          <Button size="sm" class="!py-1" :disabled="update.isPending.value" @click="saveName">Save</Button>
          <Button variant="muted-link" size="sm" class="!px-2 !py-1" @click="editing = false">Cancel</Button>
        </div>
        <div v-else class="font-medium text-gray-900 dark:text-gray-100 truncate">{{ sub.name ?? sub.counterpartyName ?? sub.counterpartyIban }}</div>
        <div class="font-mono text-xs text-gray-400 dark:text-gray-500 mt-0.5 truncate">{{ sub.counterpartyIban }}</div>
      </div>

      <div class="text-red-600 dark:text-red-400 font-mono font-medium whitespace-nowrap">{{ fmtBalance(sub.medianAmount, sub.currency, "nl-NL") }}</div>

      <span v-if="sub.intervalLabel" class="text-xs px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-medium border border-indigo-200 dark:border-indigo-800">
        {{ sub.intervalLabel }}
      </span>

      <div class="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap w-24 text-right">
        <template v-if="sub.nextExpectedDate">
          <div class="text-gray-400 dark:text-gray-500 text-[10px]">next</div>
          {{ sub.nextExpectedDate }}
        </template>
      </div>

      <span
        class="text-xs px-2 py-0.5 rounded-full font-medium"
        :class="
          sub.isActive
            ? 'bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800'
            : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700'
        "
      >
        {{ sub.isActive ? "active" : "inactive" }}
      </span>

      <div class="text-xs text-gray-400 dark:text-gray-500 w-10 text-right whitespace-nowrap">{{ sub.transactionCount ?? 0 }} tx</div>

      <div class="flex items-center gap-2 shrink-0" @click.stop>
        <Button v-if="!editing" variant="link" size="xs" @click="startEdit">Rename</Button>
        <Button variant="muted-link" size="xs" class="font-medium" :disabled="update.isPending.value" @click="update.mutate({ isActive: !sub.isActive })">
          {{ sub.isActive ? "Deactivate" : "Activate" }}
        </Button>
        <ConfirmButton label="Delete" :prompt="`Delete subscription for ${sub.counterpartyName ?? sub.counterpartyIban}?`" @confirm="remove.mutate()" />
      </div>

      <span class="text-gray-400 dark:text-gray-500 text-xs">{{ expanded ? "▴" : "▾" }}</span>
    </div>

    <div v-if="update.error.value || remove.error.value" class="px-5 pb-3"><ErrorText :error="update.error.value ?? remove.error.value" /></div>

    <div v-if="expanded" class="border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 px-5 py-3">
      <LinkedTransactions :subscription-id="sub.id" empty-text="No linked transactions." divider-class="divide-gray-100 dark:divide-gray-700" />
    </div>
  </Card>
</template>
