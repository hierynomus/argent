<script setup lang="ts">
/** The bordered card + <form> that wraps every "record something" form. Emits `submit` (default prevented). */
defineEmits<{ submit: [] }>()
</script>

<template>
  <form class="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-4 mb-4" @submit.prevent="$emit('submit')">
    <slot />
  </form>
</template>
