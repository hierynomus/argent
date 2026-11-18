<script setup lang="ts">
import { computed } from "vue"
import type { Account } from "@argent/shared"

/** "All accounts" plus one toggle chip per account. Never mutates the selection it is given. */
const props = defineProps<{ accounts: Account[]; selected: Set<string> }>()
const emit = defineEmits<{ change: [ids: Set<string>] }>()

const allSelected = computed(() => props.selected.size === 0)
const CHIP = "px-3 py-1 rounded-full text-sm font-medium border transition-colors"
const ON = "bg-indigo-600 text-white border-indigo-600"
const OFF = "bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500"

function toggle(id: string) {
  const next = new Set(props.selected)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  emit("change", next)
}
</script>

<template>
  <div class="flex flex-wrap gap-2 mb-4">
    <button type="button" :aria-pressed="allSelected" :class="[CHIP, allSelected ? ON : OFF]" @click="emit('change', new Set())">All accounts</button>
    <button v-for="acc in accounts" :key="acc.id" type="button" :aria-pressed="selected.has(acc.id)" :class="[CHIP, selected.has(acc.id) ? ON : OFF]" @click="toggle(acc.id)">
      {{ acc.name ?? acc.iban }}
    </button>
  </div>
</template>
