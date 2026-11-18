<script setup lang="ts">
import { Card } from "../../components/ui"
import type { Tile } from "./tiles"

/** The row of headline numbers above a portfolio. `—` means "not available" (e.g. no live price). */
defineProps<{ tiles: Tile[] }>()
</script>

<template>
  <div class="grid grid-cols-2 gap-4 mb-4" :class="tiles.length > 4 ? 'sm:grid-cols-5' : 'sm:grid-cols-4'">
    <Card v-for="t in tiles" :key="t.label" class="px-4 py-3">
      <p class="text-xs text-gray-400 dark:text-gray-500 mb-1">{{ t.label }}</p>
      <p class="text-lg font-semibold" :class="t.color ?? 'text-gray-900 dark:text-gray-100'">{{ t.value }}</p>
    </Card>
  </div>
</template>
