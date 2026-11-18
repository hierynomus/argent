<script setup lang="ts">
/**
 * The white bordered panel everything sits in. `lg` (default) is the compact panel used for lists and
 * forms; `xl` is the larger, softer card used on the dashboard and account screens.
 * Spacing, `overflow-hidden`, `divide-y` etc. are passed as ordinary classes; `as` swaps the element (e.g. "form").
 */
withDefaults(defineProps<{ size?: "lg" | "xl"; as?: string }>(), { size: "lg", as: "div" })

const SIZES = {
  lg: "rounded-lg border-gray-200 dark:border-gray-700",
  xl: "rounded-xl border-gray-200 dark:border-gray-800",
} as const
</script>

<template>
  <component :is="as" class="bg-white dark:bg-gray-900 border" :class="SIZES[size]"><slot /></component>
</template>
