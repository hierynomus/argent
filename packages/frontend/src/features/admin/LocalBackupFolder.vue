<script setup lang="ts">
import { ref, watch } from "vue"
import { useMutation } from "@tanstack/vue-query"
import { localSettingsSchema, type SavedBackup } from "@argent/shared"
import { saveBackupToFolder, setBackupDir, useInvalidate, useLocalSettings } from "../../api"
import { Button, ErrorText, Field, Input } from "../../components/ui"
import { isDesktopApp, pickFolder } from "../../lib/desktop"
import { useFormErrors } from "../../lib/validate"

/** Backup & Restore in the desktop app: a window has no download manager, so backups go to a folder you choose. */
const invalidate = useInvalidate()
const { data: settings } = useLocalSettings()
const { errors, check } = useFormErrors()

const folder = ref("")
watch(() => settings.value?.backupDir, (dir) => { if (dir && !folder.value) folder.value = dir }, { immediate: true })

const canBrowse = isDesktopApp()
const saved = ref<SavedBackup | null>(null)
const changeFolder = useMutation({ mutationFn: setBackupDir, onSuccess: (s) => { folder.value = s.backupDir; return invalidate.localSettings() } })
const backUp = useMutation({ mutationFn: saveBackupToFolder, onSuccess: (r) => (saved.value = r) })

const submitFolder = () => check(localSettingsSchema, { backupDir: folder.value }) && changeFolder.mutate(folder.value)
// the native dialog; a chosen folder is used at once, nobody wants a second click after browsing
const browse = useMutation({
  mutationFn: () => pickFolder(settings.value?.backupDir),
  onSuccess: (dir) => {
    if (!dir) return // cancelled
    folder.value = dir
    changeFolder.mutate(dir)
  },
})
const unchanged = () => folder.value.trim() === settings.value?.backupDir
</script>

<template>
  <div class="px-5 py-4 space-y-3">
    <div class="flex items-start justify-between gap-4">
      <div>
        <p class="text-sm font-medium text-gray-900 dark:text-gray-100">Back up now</p>
        <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Writes everything (accounts, transactions, portfolios and more) as one JSON file into the backup folder below.</p>
        <ErrorText :error="backUp.error.value" />
        <p v-if="saved" class="text-xs text-green-700 dark:text-green-400 mt-1 break-all" role="status">Saved to {{ saved.path }}</p>
      </div>
      <Button size="sm" class="shrink-0 rounded-md px-4 py-1.5" :disabled="backUp.isPending.value" @click="backUp.mutate()">{{ backUp.isPending.value ? "Backing up…" : "Back up now" }}</Button>
    </div>

    <form class="flex items-end gap-2" novalidate @submit.prevent="submitFolder">
      <div class="flex-1">
        <Field label="Backup folder" :error="errors.backupDir">
          <Input v-model="folder" placeholder="~/Backups/Argent" spellcheck="false" />
        </Field>
      </div>
      <Button v-if="canBrowse" size="sm" variant="secondary" class="rounded-md px-4 py-1.5" :disabled="browse.isPending.value" @click="browse.mutate()">Browse…</Button>
      <Button type="submit" size="sm" variant="secondary" class="rounded-md px-4 py-1.5" :disabled="changeFolder.isPending.value || unchanged()">Use this folder</Button>
    </form>
    <ErrorText :error="browse.error.value" />
    <ErrorText :error="changeFolder.error.value" />
    <p v-if="settings" class="text-xs text-gray-500 dark:text-gray-400">
      Default: <span class="font-mono">{{ settings.defaultBackupDir }}</span>. The choice is kept in <span class="font-mono">{{ settings.configFile }}</span>.
    </p>
  </div>
</template>
