<script setup lang="ts">
import { computed, ref } from "vue"
import { useAdminAccounts, useAdminSharing, useInvalidate, useMe } from "../api"
import { EmptyState, LoadingText } from "../components/ui"
import AccountMemberCard from "../features/admin/AccountMemberCard.vue"
import BackupRestoreSection from "../features/admin/BackupRestoreSection.vue"
import SharingOverview from "../features/admin/SharingOverview.vue"

type Tab = "accounts" | "sharing" | "backup"
const TABS: Array<{ id: Tab; label: string }> = [
  { id: "accounts", label: "Accounts & Permissions" },
  { id: "sharing", label: "Sharing Overview" },
  { id: "backup", label: "Backup & Restore" },
]

const invalidate = useInvalidate()
const tab = ref<Tab>("accounts")

const { data: me, isLoading: meLoading } = useMe()
const isAdmin = computed(() => me.value?.isAdmin === true)
// the admin endpoints are admin-only: don't even ask unless we know the user is one
const { data: accountsData, isLoading: accountsLoading } = useAdminAccounts({ enabled: isAdmin })
const { data: sharing, isLoading: sharingLoading } = useAdminSharing({ enabled: computed(() => isAdmin.value && tab.value === "sharing") })
const accounts = computed(() => accountsData.value ?? [])
</script>

<template>
  <LoadingText v-if="meLoading" />
  <div v-else-if="!isAdmin" class="flex flex-col items-center justify-center py-20 text-center">
    <p class="text-2xl font-semibold text-gray-400 dark:text-gray-500">403 — Forbidden</p>
    <p class="text-gray-400 dark:text-gray-500 text-sm mt-2">You do not have admin access.</p>
  </div>
  <div v-else>
    <h1 class="text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-6">Administration</h1>

    <div class="flex border-b border-gray-200 dark:border-gray-700 mb-6">
      <button
        v-for="t in TABS"
        :key="t.id"
        type="button"
        :aria-pressed="tab === t.id"
        class="px-4 py-2 text-sm font-medium border-b-2 transition-colors"
        :class="tab === t.id ? 'border-indigo-600 dark:border-indigo-400 text-indigo-600 dark:text-indigo-400' : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'"
        @click="tab = t.id"
      >
        {{ t.label }}
      </button>
    </div>

    <template v-if="tab === 'accounts'">
      <LoadingText v-if="accountsLoading" />
      <EmptyState v-else-if="accounts.length === 0" title="No accounts yet." />
      <div v-else class="flex flex-col gap-4"><AccountMemberCard v-for="account in accounts" :key="account.id" :account="account" @changed="invalidate.admin()" /></div>
    </template>

    <template v-if="tab === 'sharing'">
      <LoadingText v-if="sharingLoading" />
      <SharingOverview v-else :sharing="sharing ?? { portfolios: [], mortgages: [], loans: [], properties: [], equity: [] }" />
    </template>

    <BackupRestoreSection v-if="tab === 'backup'" />
  </div>
</template>
