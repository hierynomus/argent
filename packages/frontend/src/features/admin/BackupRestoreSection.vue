<script setup lang="ts">
import { computed, ref } from "vue"
import { useMutation } from "@tanstack/vue-query"
import { clearAllData, downloadBackup, removeDuplicates, restoreBackup, useInvalidate } from "../../api"
import { isLocalMode } from "../../auth"
import LocalBackupFolder from "./LocalBackupFolder.vue"
import { Button, Card, ErrorText } from "../../components/ui"

/** Settings → Backup & Restore (admins): download everything as JSON, or replace everything from such a file. */
const invalidate = useInvalidate()
const fileInput = ref<HTMLInputElement | null>(null)
const file = ref<File | null>(null)
const confirming = ref(false)

const local = isLocalMode()
const download = useMutation({ mutationFn: downloadBackup })


const restore = useMutation({
  mutationFn: async (f: File) => {
    let data: unknown
    try {
      data = JSON.parse(await f.text())
    } catch {
      throw new Error("That file is not valid JSON — pick a backup downloaded from here.")
    }
    return restoreBackup(data)
  },
  onSuccess: () => {
    file.value = null
    if (fileInput.value) fileInput.value.value = ""
    // the whole database was replaced: nothing already on screen can be trusted
    invalidate.everything()
  },
})

function chooseFile(e: Event) {
  file.value = (e.target as HTMLInputElement).files?.[0] ?? null
  confirming.value = false
  restore.reset()
}
function confirmRestore() {
  if (!file.value) return
  confirming.value = false
  restore.mutate(file.value)
}
// the server reports every table; only the ones that had rows are interesting
const restoredTables = computed(() => Object.entries(restore.data.value?.restored ?? {}).filter(([, count]) => count > 0))

const dedupe = useMutation({
  mutationFn: removeDuplicates,
  onSuccess: () => invalidate.everything(),
})

const erasing = ref(false)
const erase = useMutation({
  mutationFn: clearAllData,
  onSuccess: () => {
    erasing.value = false
    restore.reset()
    invalidate.everything()
  },
})
const DANGER = "px-3 py-1 text-sm bg-red-600 text-white rounded-md hover:bg-red-700"
</script>

<template>
  <Card class="divide-y divide-gray-100 dark:divide-gray-800">
    <LocalBackupFolder v-if="local" />
    <div v-else class="px-5 py-4">
      <div class="flex items-start justify-between gap-4">
        <div>
          <p class="text-sm font-medium text-gray-900 dark:text-gray-100">Download backup</p>
          <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Export all accounts, transactions, categories, portfolios and more as a single JSON file.</p>
          <ErrorText :error="download.error.value" />
        </div>
        <Button size="sm" class="shrink-0 rounded-md px-4 py-1.5" :disabled="download.isPending.value" @click="download.mutate()">{{ download.isPending.value ? "Exporting…" : "Download" }}</Button>
      </div>
    </div>

    <div class="px-5 py-4">
      <p class="text-sm font-medium text-gray-900 dark:text-gray-100">Restore from backup</p>
      <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5 mb-3">
        Select a previously downloaded backup file. <span class="text-red-500 dark:text-red-400 font-medium">This will permanently replace all existing data.</span>
      </p>

      <div class="flex items-center gap-3 flex-wrap">
        <input
          ref="fileInput"
          type="file"
          accept=".json"
          aria-label="Backup file"
          class="text-sm text-gray-600 dark:text-gray-400 file:mr-3 file:py-1 file:px-3 file:rounded-sm file:border-0 file:text-sm file:bg-gray-100 dark:file:bg-gray-700 file:text-gray-700 dark:file:text-gray-200 hover:file:bg-gray-200 dark:hover:file:bg-gray-600"
          @change="chooseFile"
        />
        <button v-if="file && !confirming" type="button" :class="DANGER" @click="confirming = true">Restore</button>
      </div>

      <div v-if="confirming" role="alertdialog" aria-label="Confirm restore" class="mt-3 p-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg">
        <p class="text-sm text-red-700 dark:text-red-300 font-medium mb-2">
          Are you sure? All current data will be deleted and replaced with the contents of <span class="font-mono">{{ file?.name }}</span>.
        </p>
        <div class="flex gap-2">
          <button type="button" :class="DANGER" @click="confirmRestore">Yes, replace all data</button>
          <Button variant="muted-link" size="sm" class="py-1!" @click="confirming = false">Cancel</Button>
        </div>
      </div>

      <p v-if="restore.isPending.value" class="mt-2 text-xs text-gray-500 dark:text-gray-400">Restoring…</p>
      <ErrorText :error="restore.error.value" />

      <div v-if="restore.data.value" class="mt-3 p-3 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg">
        <p class="text-sm font-medium text-green-700 dark:text-green-300 mb-1">Restore complete</p>
        <p v-if="restore.data.value.cleaned?.removed" class="text-xs text-green-600 dark:text-green-400 mb-1">
          Removed {{ restore.data.value.cleaned.removed }} duplicate {{ restore.data.value.cleaned.removed === 1 ? "transaction" : "transactions" }} that the backup contained.
        </p>
        <ul class="text-xs text-green-600 dark:text-green-400 space-y-0.5">
          <li v-for="[k, v] in restoredTables" :key="k">{{ k }}: {{ v }}</li>
        </ul>
      </div>
    </div>

    <div class="px-5 py-4">
      <div class="flex items-start justify-between gap-4">
        <div>
          <p class="text-sm font-medium text-gray-900 dark:text-gray-100">Remove duplicate transactions</p>
          <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            Finds bank entries that are stored more than once (for instance from an old backup), keeps one of each, with its category and transfer link, and removes the rest.
          </p>
          <ErrorText :error="dedupe.error.value" />
          <p v-if="dedupe.data.value" class="mt-2 text-sm text-green-700 dark:text-green-300">
            {{ dedupe.data.value.removed === 0 ? "No duplicates found." : `Removed ${dedupe.data.value.removed} duplicate ${dedupe.data.value.removed === 1 ? "transaction" : "transactions"}.` }}
          </p>
        </div>
        <Button size="sm" class="shrink-0 rounded-md px-4 py-1.5" :disabled="dedupe.isPending.value" @click="dedupe.mutate()">{{ dedupe.isPending.value ? "Checking…" : "Remove duplicates" }}</Button>
      </div>
    </div>

    <div class="px-5 py-4">
      <p class="text-sm font-medium text-gray-900 dark:text-gray-100">Erase all data</p>
      <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5 mb-3">
        Empty the database completely: accounts, transactions, portfolios, debts, everything. <span class="text-red-500 dark:text-red-400 font-medium">This cannot be undone</span>, so download a backup first.
      </p>
      <button v-if="!erasing" type="button" :class="DANGER" @click="erasing = true">Erase all data…</button>
      <div v-else role="alertdialog" aria-label="Confirm erase" class="p-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg">
        <p class="text-sm text-red-700 dark:text-red-300 font-medium mb-2">Are you sure? Everything in the database will be deleted for good.</p>
        <div class="flex gap-2">
          <button type="button" :class="DANGER" :disabled="erase.isPending.value" @click="erase.mutate()">{{ erase.isPending.value ? "Erasing…" : "Yes, erase everything" }}</button>
          <Button variant="muted-link" size="sm" class="py-1!" @click="erasing = false">Cancel</Button>
        </div>
      </div>
      <ErrorText :error="erase.error.value" />
      <p v-if="erase.isSuccess.value" class="mt-2 text-sm text-green-700 dark:text-green-300">All data was erased.</p>
    </div>
  </Card>
</template>
