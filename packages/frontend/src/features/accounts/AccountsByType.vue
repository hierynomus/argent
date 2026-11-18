<script setup lang="ts">
import { computed } from "vue"
import type { Account } from "@argent/shared"
import { useAccounts } from "../../api"
import AccountCard from "./AccountCard.vue"

/** The "Checking" and "Savings" screens: all accounts of one type as cards. */
const props = defineProps<{
  title: string
  /** lower-case plural used in the empty state, e.g. "checking accounts" */
  noun: string
  emptyHint: string
  matches: (account: Account) => boolean
}>()

const { data, isLoading } = useAccounts()
const shown = computed(() => (data.value ?? []).filter(props.matches))
</script>

<template>
  <div v-if="isLoading" class="text-gray-400 dark:text-gray-500 text-sm">Loading…</div>
  <div v-else class="space-y-6">
    <h1 class="text-2xl font-bold text-gray-900 dark:text-gray-100">{{ title }}</h1>
    <div v-if="shown.length === 0" class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 px-6 py-12 text-center">
      <p class="text-gray-500 dark:text-gray-400 text-sm">No {{ noun }} yet.</p>
      <p class="text-gray-400 dark:text-gray-500 text-xs mt-1">{{ emptyHint }}</p>
    </div>
    <div v-else class="grid gap-6"><AccountCard v-for="account in shown" :key="account.id" :account="account" /></div>
  </div>
</template>
