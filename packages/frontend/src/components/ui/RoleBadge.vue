<script setup lang="ts">
defineProps<{ role: "viewer" | "editor" | string }>()
</script>

<template>
  <span
    class="text-xs px-1.5 py-0.5 rounded font-medium"
    :class="
      role === 'editor'
        ? 'bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300'
        : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
    "
  >
    {{ role }}
  </span>
</template>
