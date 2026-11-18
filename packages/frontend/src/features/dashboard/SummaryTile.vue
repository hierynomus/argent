<script setup lang="ts">
import { Card } from "../../components/ui"
import Skeleton from "./Skeleton.vue"

defineProps<{ label: string; value?: string; sub?: string; loading?: boolean }>()
</script>

<template>
  <Card size="xl" class="px-5 py-4 flex flex-col gap-1.5">
    <p class="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">{{ label }}</p>
    <Skeleton v-if="loading" class="h-7 w-28 mt-0.5" />
    <p v-else class="text-xl font-bold text-gray-900 dark:text-gray-100">{{ value ?? "—" }}</p>
    <p v-if="sub && !loading" class="text-xs text-gray-400 dark:text-gray-500">{{ sub }}</p>
  </Card>
</template>
