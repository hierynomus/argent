<script setup lang="ts">
import type { AccountWithMembers } from "@argent/shared"
import GroupAccess from "./GroupAccess.vue"
import OwnerRow from "./OwnerRow.vue"

/** Admin view of one account: owner and group access. */
defineProps<{ account: AccountWithMembers }>()
defineEmits<{ changed: [] }>()
</script>

<template>
  <div class="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
    <div class="px-5 py-4 border-b border-gray-100 dark:border-gray-800">
      <div class="font-medium text-gray-900 dark:text-gray-100">
        <template v-if="account.name">{{ account.name }}</template>
        <span v-else class="text-gray-400 dark:text-gray-500 italic">Unnamed</span>
      </div>
      <div class="font-mono text-xs text-gray-400 dark:text-gray-500 mt-0.5">{{ account.iban }}</div>
      <div class="mt-2"><OwnerRow :account="account" @changed="$emit('changed')" /></div>
    </div>
    <GroupAccess :account="account" @changed="$emit('changed')" />
  </div>
</template>
