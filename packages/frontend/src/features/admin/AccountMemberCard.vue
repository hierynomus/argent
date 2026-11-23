<script setup lang="ts">
import { Card } from "../../components/ui"
import { hasRealIban, type AccountWithMembers } from "@argent/shared"
import GroupAccess from "./GroupAccess.vue"
import OwnerRow from "./OwnerRow.vue"

/** Admin view of one account: owner and group access. */
defineProps<{ account: AccountWithMembers }>()
defineEmits<{ changed: [] }>()
</script>

<template>
  <Card class="overflow-hidden">
    <div class="px-5 py-4 border-b border-gray-100 dark:border-gray-800">
      <div class="font-medium text-gray-900 dark:text-gray-100">
        <template v-if="account.name">{{ account.name }}</template>
        <span v-else class="text-gray-400 dark:text-gray-500 italic">Unnamed</span>
      </div>
      <div v-if="hasRealIban(account)" class="font-mono text-xs text-gray-400 dark:text-gray-500 mt-0.5">{{ account.iban }}</div>
      <div class="mt-2"><OwnerRow :account="account" @changed="$emit('changed')" /></div>
    </div>
    <GroupAccess :account="account" @changed="$emit('changed')" />
  </Card>
</template>
