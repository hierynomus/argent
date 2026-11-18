<script setup lang="ts">
import { computed, ref } from "vue"
import { useAccounts } from "../../api"
import { Button, Card, LoadingText } from "../../components/ui"
import { fmtBalance } from "../../lib/format"
import AccountEditForm from "./AccountEditForm.vue"

/** Settings → Accounts: every account with its balance, and inline editing. */
const editingId = ref<string | null>(null)
const { data, isLoading } = useAccounts()
const accounts = computed(() => data.value ?? [])

const TYPE_BADGE = {
  savings: "bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800",
  checking: "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700",
}
</script>

<template>
  <LoadingText v-if="isLoading" />
  <Card v-else class="divide-y divide-gray-100 dark:divide-gray-800">
    <div v-for="acc in accounts" :key="acc.id" class="px-5 py-4">
      <div class="flex items-center gap-4">
        <div class="flex-1 min-w-0">
          <div class="font-mono text-xs text-gray-400 dark:text-gray-500 mb-0.5">{{ acc.iban }}</div>
          <div class="text-sm font-medium text-gray-900 dark:text-gray-100">
            <template v-if="acc.name">{{ acc.name }}</template>
            <span v-else class="text-gray-400 dark:text-gray-500 italic">No name set</span>
          </div>
        </div>
        <div class="flex items-center gap-3 shrink-0">
          <span class="text-xs px-2 py-0.5 rounded-full font-medium border" :class="TYPE_BADGE[acc.type === 'savings' ? 'savings' : 'checking']">{{ acc.type === "savings" ? "Savings" : "Checking" }}</span>
          <span class="text-sm font-mono font-semibold text-gray-900 dark:text-gray-100">{{ fmtBalance(acc.balance ?? "0", acc.currency) }}</span>
          <span class="text-xs text-gray-400 dark:text-gray-500 uppercase">{{ acc.currency }}</span>
          <Button v-if="editingId !== acc.id" variant="link" size="xs" @click="editingId = acc.id">Edit</Button>
        </div>
      </div>
      <AccountEditForm v-if="editingId === acc.id" :account="acc" @done="editingId = null" />
    </div>
    <div v-if="accounts.length === 0" class="px-5 py-10 text-center text-gray-400 dark:text-gray-500 text-sm">No accounts yet — import a CAMT.053 file to get started.</div>
  </Card>
</template>
