<script setup lang="ts">
import { computed } from "vue"
import { useAdminAccounts, useInvalidate } from "../../api"
import { EmptyState, LoadingText } from "../../components/ui"
import AccountMemberCard from "./AccountMemberCard.vue"

/** Settings → Access (admins, server): which groups can see and edit each account. */
const invalidate = useInvalidate()
const { data, isLoading } = useAdminAccounts()
const accounts = computed(() => data.value ?? [])
</script>

<template>
  <LoadingText v-if="isLoading" />
  <EmptyState v-else-if="accounts.length === 0" title="No accounts yet." />
  <div v-else class="flex flex-col gap-4"><AccountMemberCard v-for="account in accounts" :key="account.id" :account="account" @changed="invalidate.admin()" /></div>
</template>
