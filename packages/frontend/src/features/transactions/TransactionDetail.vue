<script setup lang="ts">
import { onBeforeUnmount, onMounted } from "vue"
import { useRouter } from "vue-router"
import { useMutation } from "@tanstack/vue-query"
import type { Category, TransactionWithDetails } from "@argent/shared"
import { unlinkTransfer } from "../../api"
import { Button, ErrorText, Select } from "../../components/ui"
import { fmtSignedAmount } from "../../lib/format"
import LinkTransferSection from "./LinkTransferSection.vue"

/** Slide-out with everything about one transaction, plus labelling and transfer linking. Escape or the backdrop closes it. */
const props = defineProps<{ tx: TransactionWithDetails; labels: Category[] }>()
const emit = defineEmits<{ close: []; label: [id: string, categoryId: string | null]; transferChange: [updated: TransactionWithDetails] }>()

const router = useRouter()
const unlink = useMutation({
  mutationFn: () => unlinkTransfer(props.tx.id),
  onSuccess: () => emit("transferChange", { ...props.tx, transferPeerId: null, transferPeer: null }),
})

const onKey = (e: KeyboardEvent) => e.key === "Escape" && emit("close")
onMounted(() => document.addEventListener("keydown", onKey))
onBeforeUnmount(() => document.removeEventListener("keydown", onKey))

function viewSubscription() {
  emit("close")
  router.push("/subscriptions")
}
const DT = "text-gray-500 dark:text-gray-400 font-medium pt-0.5"
</script>

<template>
  <div class="fixed inset-0 z-40 bg-black/20 dark:bg-black/40" @click="emit('close')" />
  <div role="dialog" aria-label="Transaction details" class="fixed right-0 top-0 z-50 h-full w-full max-w-md bg-white dark:bg-gray-900 shadow-xl border-l border-gray-200 dark:border-gray-700 flex flex-col">
    <div class="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700 shrink-0">
      <h2 class="font-semibold text-gray-900 dark:text-gray-100">Transaction Details</h2>
      <button type="button" aria-label="Close" class="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 text-2xl leading-none" @click="emit('close')">
        <span aria-hidden="true">×</span>
      </button>
    </div>

    <div class="overflow-y-auto flex-1 p-5 space-y-5">
      <div class="text-3xl font-bold" :class="tx.creditDebitIndicator === 'CRDT' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'">
        {{ fmtSignedAmount(tx.amount, tx.creditDebitIndicator, tx.currency) }}
      </div>

      <dl class="grid grid-cols-[9rem_1fr] gap-x-4 gap-y-3 text-sm">
        <dt :class="DT">Booking date</dt>
        <dd><span class="text-gray-900 dark:text-gray-100">{{ tx.bookingDate }}</span></dd>

        <template v-if="tx.valueDate && tx.valueDate !== tx.bookingDate">
          <dt :class="DT">Value date</dt>
          <dd><span class="text-gray-900 dark:text-gray-100">{{ tx.valueDate }}</span></dd>
        </template>

        <dt :class="DT">Account</dt>
        <dd>
          <div class="text-gray-900 dark:text-gray-100">{{ tx.account.name ?? tx.account.iban }}</div>
          <div v-if="tx.account.name" class="text-gray-400 dark:text-gray-500 text-xs font-mono mt-0.5">{{ tx.account.iban }}</div>
        </dd>

        <template v-if="tx.counterpartyName && !tx.transferPeerId">
          <dt :class="DT">Counterparty</dt>
          <dd>
            <div class="text-gray-900 dark:text-gray-100">{{ tx.counterpartyName }}</div>
            <div v-if="tx.counterpartyIban" class="text-gray-400 dark:text-gray-500 text-xs font-mono mt-0.5">{{ tx.counterpartyIban }}</div>
          </dd>
        </template>

        <template v-if="tx.description">
          <dt :class="DT">Description</dt>
          <dd><span class="text-gray-900 dark:text-gray-100 break-words">{{ tx.description }}</span></dd>
        </template>

        <template v-if="tx.reference">
          <dt :class="DT">Reference</dt>
          <dd><span class="text-gray-900 dark:text-gray-100 font-mono text-xs break-all">{{ tx.reference }}</span></dd>
        </template>

        <dt :class="DT">Transfer</dt>
        <dd>
          <template v-if="tx.transferPeer">
            <div class="flex items-center gap-3">
              <span class="text-indigo-700 dark:text-indigo-300 font-medium">↔ {{ tx.transferPeer.account.name ?? tx.transferPeer.account.iban }}</span>
              <span class="text-gray-400 dark:text-gray-500 text-xs">{{ tx.transferPeer.bookingDate }}</span>
              <Button variant="danger-link" size="xs" class="ml-auto" :disabled="unlink.isPending.value" @click="unlink.mutate()">Unlink</Button>
            </div>
            <ErrorText :error="unlink.error.value" />
          </template>
          <LinkTransferSection v-else :tx="tx" @linked="(u) => emit('transferChange', u)" />
        </dd>

        <template v-if="tx.subscriptionId">
          <dt :class="DT">Subscription</dt>
          <dd><Button variant="link" class="text-sm" @click="viewSubscription">↻ View subscription →</Button></dd>
        </template>

        <dt :class="DT">Label</dt>
        <dd>
          <Select density="sm" aria-label="Label" class="w-full" :model-value="tx.categoryId ?? ''" @update:model-value="(v: string | undefined) => emit('label', tx.id, v || null)">
            <option value="">Unlabeled</option>
            <option v-for="l in labels" :key="l.id" :value="l.id">{{ l.name }}</option>
          </Select>
        </dd>
      </dl>
    </div>
  </div>
</template>
