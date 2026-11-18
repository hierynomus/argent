<script setup lang="ts">
import { computed } from "vue"
import type { Category } from "@argent/shared"

/** A label rendered as a pill in its own colour (indigo when it has none). */
const props = defineProps<{ category: Pick<Category, "name" | "color"> | null }>()
const color = computed(() => props.category?.color ?? "#6366f1")
</script>

<template>
  <span v-if="!category" class="text-gray-300 dark:text-gray-600 text-xs">—</span>
  <span
    v-else
    class="inline-flex items-center text-xs px-2 py-0.5 rounded-full font-medium border"
    :style="{ backgroundColor: `${color}22`, color, borderColor: `${color}44` }"
  >
    {{ category.name }}
  </span>
</template>
