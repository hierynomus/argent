<script setup lang="ts">
import { Button } from "./ui"

/** "N things · Prev · Page X · Next" footer for a paged list. */
defineProps<{
  page: number
  pageSize: number
  total: number
  /** plural, e.g. "transactions" */
  noun: string
}>()
defineEmits<{ page: [page: number] }>()
</script>

<template>
  <div class="flex items-center justify-between mt-4 text-sm text-gray-500 dark:text-gray-400">
    <span>{{ total }} {{ noun }}</span>
    <div class="flex gap-2">
      <Button variant="secondary" class="px-3! py-1! disabled:opacity-40" :disabled="page <= 1" @click="$emit('page', page - 1)">Prev</Button>
      <span class="px-3 py-1">Page {{ page }}</span>
      <Button variant="secondary" class="px-3! py-1! disabled:opacity-40" :disabled="total <= page * pageSize" @click="$emit('page', page + 1)">Next</Button>
    </div>
  </div>
</template>
