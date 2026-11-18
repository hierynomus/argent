<script setup lang="ts">
import { ref } from "vue"
import { useMutation } from "@tanstack/vue-query"
import type { Subscription } from "@argent/shared"
import { updateSubscription, useInvalidate } from "../../api"
import { Button, ErrorText } from "../../components/ui"
import { fmtBalance } from "../../lib/format"
import LinkedTransactions from "./LinkedTransactions.vue"

/** A subscription the detector suggests. Confirm it to keep it, or dismiss it (it will not come back). */
const props = defineProps<{ sub: Subscription }>()
const invalidate = useInvalidate()
const expanded = ref(false)

const decide = useMutation({
  mutationFn: (status: "confirmed" | "dismissed") => updateSubscription(props.sub.id, { status }),
  onSuccess: () => invalidate.subscriptions(),
})
</script>

<template>
  <div class="border border-amber-200 dark:border-amber-800 rounded-lg bg-amber-50 dark:bg-amber-950/30 overflow-hidden">
    <div class="px-5 py-4 flex items-center gap-4 cursor-pointer hover:bg-amber-100/60 dark:hover:bg-amber-900/20 transition-colors" @click="expanded = !expanded">
      <div class="flex-1 min-w-0">
        <div class="font-medium text-gray-900 dark:text-gray-100 truncate">{{ sub.name ?? sub.counterpartyName ?? sub.counterpartyIban }}</div>
        <div class="font-mono text-xs text-gray-400 dark:text-gray-500 mt-0.5 truncate">{{ sub.counterpartyIban }}</div>
      </div>

      <div class="text-red-600 dark:text-red-400 font-mono font-medium whitespace-nowrap">{{ fmtBalance(sub.medianAmount, sub.currency, "nl-NL") }}</div>

      <span v-if="sub.intervalLabel" class="text-xs px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 font-medium border border-amber-200 dark:border-amber-800">
        {{ sub.intervalLabel }}
      </span>

      <div class="text-xs text-gray-400 dark:text-gray-500 whitespace-nowrap">{{ sub.transactionCount ?? 0 }} transactions</div>

      <div class="flex items-center gap-2 shrink-0" @click.stop>
        <Button size="xs" class="rounded-md px-3 py-1.5" :disabled="decide.isPending.value" @click="decide.mutate('confirmed')">Confirm</Button>
        <Button variant="secondary" size="xs" class="rounded-md px-3 py-1.5 font-medium" :disabled="decide.isPending.value" @click="decide.mutate('dismissed')">Dismiss</Button>
      </div>

      <span class="text-amber-400 dark:text-amber-500 text-xs">{{ expanded ? "▴" : "▾" }}</span>
    </div>

    <div v-if="decide.error.value" class="px-5 pb-3"><ErrorText :error="decide.error.value" /></div>

    <div v-if="expanded" class="border-t border-amber-200 dark:border-amber-700 bg-white/60 dark:bg-gray-900/40 px-5 py-3">
      <LinkedTransactions :subscription-id="sub.id" empty-text="No linked transactions yet." divider-class="divide-amber-100 dark:divide-amber-900/30" />
    </div>
  </div>
</template>
