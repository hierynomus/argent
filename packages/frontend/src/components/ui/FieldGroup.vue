<script setup lang="ts">
import { useId } from "vue"

/** Like `Field`, for a control made of several buttons (e.g. a segmented toggle): labels the group instead. */
defineProps<{ label: string }>()
const id = useId()
</script>

<template>
  <div role="group" :aria-labelledby="id">
    <span :id="id" class="block text-xs text-gray-500 dark:text-gray-400 mb-1">{{ label }}</span>
    <slot />
  </div>
</template>
