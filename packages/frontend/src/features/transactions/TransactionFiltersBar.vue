<script setup lang="ts">
import type { Category, TransactionFilters } from "@argent/shared"
import { Input, Select } from "../../components/ui"

/** Search / date range / label filters. Reports changes as a partial filter; the page resets to page 1. */
defineProps<{ labels: Category[] }>()
const emit = defineEmits<{ change: [patch: Partial<TransactionFilters>] }>()
const text = (e: Event) => (e.target as HTMLInputElement | HTMLSelectElement).value
</script>

<template>
  <div class="flex gap-3 mb-4 flex-wrap">
    <Input density="lg" type="text" placeholder="Search description…" aria-label="Search description" class="w-60 rounded-md" @input="emit('change', { search: text($event) })" />
    <Input density="lg" type="date" aria-label="From date" class="rounded-md" @input="emit('change', { from: text($event) })" />
    <Input density="lg" type="date" aria-label="To date" class="rounded-md" @input="emit('change', { to: text($event) })" />
    <Select density="lg" aria-label="Label" class="rounded-md" @change="emit('change', { categoryId: text($event) || undefined })">
      <option value="">All labels</option>
      <option value="uncategorized">Unlabeled</option>
      <option v-for="l in labels" :key="l.id" :value="l.id">{{ l.name }}</option>
    </Select>
  </div>
</template>
