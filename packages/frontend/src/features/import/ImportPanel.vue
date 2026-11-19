<script setup lang="ts">
import { Card, Td, Th } from "../../components/ui"
import { computed, ref } from "vue"
import type { ImportResult } from "@argent/shared"
import { importCamt053, importCamt053Zip, useInvalidate } from "../../api"

type FileResult =
  | { filename: string; status: "pending" }
  | { filename: string; status: "importing" }
  | { filename: string; status: "done"; result: ImportResult }
  | { filename: string; status: "error"; error: string }

/** Drop or pick CAMT.053 XML / ZIP files; shows per-file progress and totals. */
const invalidate = useInvalidate()
const input = ref<HTMLInputElement | null>(null)
const items = ref<FileResult[]>([])

/** Replaces the row with the same filename. */
const updateItem = (next: FileResult) => (items.value = items.value.map((i) => (i.filename === next.filename ? next : i)))

async function handleFiles(files: FileList | null | undefined) {
  if (!files?.length) return
  const list = Array.from(files)
  items.value = list.map((f) => ({ filename: f.name, status: "pending" }))
  for (const file of list) {
    updateItem({ filename: file.name, status: "importing" })
    try {
      if (file.name.toLowerCase().endsWith(".zip")) {
        const { results, errors } = await importCamt053Zip(file)
        const expanded: FileResult[] = [
          ...results.map((r) => ({ filename: r.filename, status: "done" as const, result: { accountIban: r.accountIban, imported: r.imported, skipped: r.skipped } })),
          ...errors.map((e) => ({ filename: e.filename, status: "error" as const, error: e.error })),
        ]
        items.value = [...items.value.filter((i) => i.filename !== file.name), ...expanded]
        if (results.length > 0) invalidate.afterImport()
      } else {
        const result = await importCamt053(file)
        updateItem({ filename: file.name, status: "done", result })
        if (result.imported > 0) invalidate.afterImport()
      }
    } catch (err) {
      updateItem({ filename: file.name, status: "error", error: (err as Error).message })
    }
  }
}

const done = (i: FileResult): i is Extract<FileResult, { status: "done" }> => i.status === "done"
const failed = (i: FileResult): i is Extract<FileResult, { status: "error" }> => i.status === "error"
const isDone = computed(() => items.value.length > 0 && items.value.every((i) => done(i) || failed(i)))
const totalImported = computed(() => items.value.reduce((sum, i) => sum + (done(i) ? i.result.imported : 0), 0))
const totalSkipped = computed(() => items.value.reduce((sum, i) => sum + (done(i) ? i.result.skipped : 0), 0))
const errored = computed(() => items.value.filter(failed))
</script>

<template>
  <div class="max-w-2xl">
    <div
      class="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-12 text-center cursor-pointer hover:border-indigo-400 dark:hover:border-indigo-500 transition-colors"
      @click="input?.click()"
      @dragover.prevent
      @drop.prevent="handleFiles(($event as DragEvent).dataTransfer?.files)"
    >
      <p class="text-gray-500 dark:text-gray-400 mb-2">Drag &amp; drop CAMT.053 XML or ZIP files here</p>
      <p class="text-sm text-gray-400 dark:text-gray-500">or click to select files</p>
      <!-- the input sits inside the clickable drop zone: its own click must not bubble up and re-trigger it -->
      <input ref="input" type="file" aria-label="CAMT.053 files" accept=".xml,.zip" multiple class="hidden" @click.stop @change="handleFiles(($event.target as HTMLInputElement).files)" />
    </div>

    <div v-if="items.length > 0" class="mt-6">
      <Card class="overflow-hidden">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
              <Th>File</Th>
              <Th>Account</Th>
              <Th align="right">Imported</Th>
              <Th align="right">Skipped</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100 dark:divide-gray-800">
            <tr v-for="item in items" :key="item.filename">
              <td class="px-4 py-3 font-mono text-xs text-gray-600 dark:text-gray-400 max-w-[200px] truncate">{{ item.filename }}</td>
              <td class="px-4 py-3 font-mono text-xs text-gray-500 dark:text-gray-400">{{ done(item) ? item.result.accountIban : "—" }}</td>
              <td class="px-4 py-3 text-right text-green-700 dark:text-green-400 font-medium">{{ done(item) ? item.result.imported : "—" }}</td>
              <td class="px-4 py-3 text-right text-gray-400 dark:text-gray-500">{{ done(item) ? item.result.skipped : "—" }}</td>
              <Td>
                <span v-if="item.status === 'pending'" class="text-gray-400 dark:text-gray-500 text-xs">Waiting…</span>
                <span v-else-if="item.status === 'importing'" class="text-indigo-600 dark:text-indigo-400 text-xs">Importing…</span>
                <span v-else-if="item.status === 'done'" class="text-green-600 dark:text-green-400 text-xs">Done</span>
                <span v-else class="text-red-600 dark:text-red-400 text-xs" :title="item.error">Error</span>
              </Td>
            </tr>
          </tbody>
          <tfoot v-if="isDone && items.length > 1">
            <tr class="border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-xs font-medium text-gray-600 dark:text-gray-400">
              <Td dense colspan="2">Total</Td>
              <td class="px-4 py-2 text-right text-green-700 dark:text-green-400">{{ totalImported }}</td>
              <td class="px-4 py-2 text-right text-gray-400 dark:text-gray-500">{{ totalSkipped }}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </Card>

      <div v-if="errored.length > 0" class="mt-3 space-y-1">
        <p v-for="i in errored" :key="i.filename" class="text-xs text-red-600 dark:text-red-400"><span class="font-mono">{{ i.filename }}</span>: {{ i.error }}</p>
      </div>
    </div>
  </div>
</template>
