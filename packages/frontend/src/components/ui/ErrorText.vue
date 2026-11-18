<script setup lang="ts">
import { computed } from "vue"

/** Shows an error's message under a form or action; renders nothing when there is none. */
const props = defineProps<{ error?: unknown }>()
const message = computed(() => (!props.error ? "" : props.error instanceof Error ? props.error.message : String(props.error)))
</script>

<template>
  <p v-if="message" class="text-sm text-red-600 dark:text-red-400 mt-2">{{ message }}</p>
</template>
