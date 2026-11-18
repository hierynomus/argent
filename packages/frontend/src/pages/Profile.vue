<script setup lang="ts">
import { useMutation, useQueryClient } from "@tanstack/vue-query"
import type { UserProfile } from "@argent/shared"
import { queryKeys, updateMe, useMe } from "../api"
import Icon, { type IconName } from "../components/Icon.vue"
import { Card, ErrorText, LoadingText } from "../components/ui"

type Theme = "light" | "dark" | "system"
const THEMES: { value: Theme; label: string; description: string; icon: IconName }[] = [
  { value: "light", label: "Light", description: "Always light", icon: "sun" },
  { value: "dark", label: "Dark", description: "Always dark", icon: "moon" },
  { value: "system", label: "System", description: "Follow OS setting", icon: "monitor" },
]

const qc = useQueryClient()
const { data: me, isLoading } = useMe()

// the choice takes effect immediately (the layout reads it from the cached profile)
const changeTheme = useMutation({
  mutationFn: (theme: Theme) => updateMe({ theme }),
  onSuccess: (updated) => qc.setQueryData<UserProfile>(queryKeys.me, (prev) => (prev ? { ...prev, ...updated } : updated)),
})
</script>

<template>
  <LoadingText v-if="isLoading" />
  <div v-else class="max-w-lg">
    <h1 class="text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-6">Profile</h1>

    <Card class="divide-y divide-gray-100 dark:divide-gray-800 mb-6">
      <div class="px-5 py-4">
        <p class="text-xs text-gray-400 dark:text-gray-500 mb-0.5">Name</p>
        <p class="text-sm text-gray-900 dark:text-gray-100 font-medium">
          <template v-if="me?.name">{{ me.name }}</template><span v-else class="text-gray-400 italic">Not set</span>
        </p>
      </div>
      <div class="px-5 py-4">
        <p class="text-xs text-gray-400 dark:text-gray-500 mb-0.5">Email</p>
        <p class="text-sm text-gray-900 dark:text-gray-100 font-medium">
          <template v-if="me?.email">{{ me.email }}</template><span v-else class="text-gray-400 italic">Not set</span>
        </p>
      </div>
      <div class="px-5 py-4">
        <p class="text-xs text-gray-400 dark:text-gray-500 mb-0.5">Role</p>
        <div class="flex items-center gap-2 mt-0.5">
          <span v-if="me?.isAdmin" class="text-xs font-medium px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300">Admin</span>
          <span v-if="me?.canImport" class="text-xs font-medium px-1.5 py-0.5 rounded bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300">Import</span>
          <span v-if="!me?.isAdmin && !me?.canImport" class="text-sm text-gray-400">Viewer</span>
        </div>
      </div>
    </Card>

    <Card class="px-5 py-4">
      <p class="text-sm font-medium text-gray-900 dark:text-gray-100 mb-3">Theme</p>
      <div class="flex gap-2">
        <button
          v-for="t in THEMES"
          :key="t.value"
          type="button"
          :aria-pressed="(me?.theme ?? 'system') === t.value"
          class="flex-1 flex flex-col items-center gap-1 px-3 py-3 rounded-lg border text-sm transition-colors"
          :class="(me?.theme ?? 'system') === t.value ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300' : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600'"
          @click="changeTheme.mutate(t.value)"
        >
          <Icon :name="t.icon" :color="(me?.theme ?? 'system') === t.value ? 'currentColor' : '#9ca3af'" />
          <span class="font-medium">{{ t.label }}</span>
          <span class="text-xs text-gray-400 dark:text-gray-500">{{ t.description }}</span>
        </button>
      </div>
      <ErrorText :error="changeTheme.error.value" />
    </Card>
  </div>
</template>
