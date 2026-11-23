<script setup lang="ts" generic="T extends string">
/**
 * A row of mutually exclusive buttons (role: viewer/editor, currency: EUR/USD, part type, …) with `v-model`.
 * Each option is a real button with `aria-pressed`, so it is keyboard- and screen-reader friendly.
 */
withDefaults(
  defineProps<{
    options: ReadonlyArray<T | { value: T; label: string }>
    /** padding classes for each segment */
    padding?: string
    capitalize?: boolean
  }>(),
  { padding: "px-2.5 py-1", capitalize: false },
)
const model = defineModel<T>({ required: true })

const norm = (o: T | { value: T; label: string }) => (typeof o === "string" ? { value: o as T, label: o as string } : o)
</script>

<template>
  <div class="flex rounded-sm border border-gray-300 dark:border-gray-600 overflow-hidden text-sm">
    <button
      v-for="opt in options"
      :key="norm(opt).value"
      type="button"
      :aria-pressed="norm(opt).value === model"
      :class="[
        padding,
        capitalize && 'capitalize',
        norm(opt).value === model
          ? 'bg-indigo-600 text-white'
          : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700',
      ]"
      @click="model = norm(opt).value"
    >
      {{ norm(opt).label }}
    </button>
  </div>
</template>
