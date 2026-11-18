<script setup lang="ts">
import Card from "./Card.vue"
/** The centred "nothing here yet" panel. */
defineProps<{ title: string; hint?: string }>()
</script>

<template>
  <Card size="xl" class="px-6 py-12 text-center">
    <p class="text-gray-500 dark:text-gray-400 text-sm">{{ title }}</p>
    <p v-if="hint" class="text-gray-400 dark:text-gray-500 text-xs mt-1">{{ hint }}</p>
    <slot />
  </Card>
</template>
