<script setup lang="ts">
import { computed } from "vue"
import { useRoute, useRouter } from "vue-router"
import { useMe } from "../api"
import { isLocalMode } from "../auth"
import AccessTab from "../features/admin/AccessTab.vue"
import BackupRestoreSection from "../features/admin/BackupRestoreSection.vue"
import SharingTab from "../features/admin/SharingTab.vue"
import ImportPanel from "../features/import/ImportPanel.vue"
import AccountsTab from "../features/settings/AccountsTab.vue"
import LabelsTab from "../features/settings/LabelsTab.vue"

/** Everything that configures the app, in one place. Access and sharing are for server admins (the standalone app has no groups). */
const route = useRoute()
const router = useRouter()
const { data: me } = useMe()

const isAdmin = computed(() => me.value?.isAdmin === true)
const groups = !isLocalMode()
const tabs = computed(() => [
  { id: "accounts", label: "Accounts" },
  { id: "labels", label: "Labels" },
  ...(me.value?.canImport ? [{ id: "import", label: "Import" }] : []),
  ...(isAdmin.value && groups ? [{ id: "access", label: "Access" }, { id: "sharing", label: "Sharing" }] : []),
  ...(isAdmin.value ? [{ id: "backup", label: "Backup & Restore" }] : []),
])
// a tab that is not there for this user (an old /admin link in the standalone app) falls back to Accounts
const activeTab = computed(() => {
  const wanted = typeof route.query.tab === "string" ? route.query.tab : "accounts"
  return !me.value || tabs.value.some((t) => t.id === wanted) ? wanted : "accounts"
})
const setTab = (id: string) => router.replace({ query: { tab: id } })
</script>

<template>
  <div>
    <h1 class="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6">Settings</h1>

    <div class="flex flex-wrap gap-1 border-b border-gray-200 dark:border-gray-700 mb-6">
      <button
        v-for="t in tabs"
        :key="t.id"
        type="button"
        :aria-pressed="activeTab === t.id"
        class="px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors"
        :class="activeTab === t.id ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400' : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'"
        @click="setTab(t.id)"
      >
        {{ t.label }}
      </button>
    </div>

    <AccountsTab v-if="activeTab === 'accounts'" />
    <LabelsTab v-if="activeTab === 'labels'" />
    <ImportPanel v-if="activeTab === 'import' && me?.canImport" />
    <AccessTab v-if="activeTab === 'access' && isAdmin && groups" />
    <SharingTab v-if="activeTab === 'sharing' && isAdmin && groups" />
    <BackupRestoreSection v-if="activeTab === 'backup' && isAdmin" />
  </div>
</template>
