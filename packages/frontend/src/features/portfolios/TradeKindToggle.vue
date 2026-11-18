<script setup lang="ts" generic="T extends 'buy' | 'sell' | 'swap'">
/** Buy / Swap / Sell switch at the top of a trade form (green / blue / red when active), with `v-model`. */
defineProps<{ options: readonly T[] }>()
const model = defineModel<T>({ required: true })

const ACTIVE = { buy: "bg-green-600 text-white", sell: "bg-red-600 text-white", swap: "bg-blue-600 text-white" } as const
</script>

<template>
  <div class="flex gap-2 mb-4">
    <button
      v-for="kind in options"
      :key="kind"
      type="button"
      :aria-pressed="kind === model"
      class="px-4 py-1.5 text-sm font-medium rounded-lg transition-colors capitalize"
      :class="kind === model ? ACTIVE[kind] : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'"
      @click="model = kind"
    >
      {{ kind }}
    </button>
  </div>
</template>
