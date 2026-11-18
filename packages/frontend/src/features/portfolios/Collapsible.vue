<script setup lang="ts">
import { ref } from "vue"

/** A card whose header toggles its content (used for trade / dividend history). */
defineProps<{ title: string }>()
const open = ref(false)
</script>

<template>
  <div class="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
    <button
      type="button"
      :aria-expanded="open"
      class="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
      @click="open = !open"
    >
      <span>{{ title }}</span>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="transition-transform" :class="open && 'rotate-180'" aria-hidden="true">
        <polyline points="6 9 12 15 18 9" />
      </svg>
    </button>
    <div v-if="open" class="overflow-x-auto border-t border-gray-100 dark:border-gray-800"><slot /></div>
  </div>
</template>
