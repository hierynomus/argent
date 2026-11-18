<script setup lang="ts">
import type { DebtPart } from "../../api"
import { Badge } from "../../components/ui"
import { PART_TYPE_LABELS } from "./config"

defineProps<{ type: DebtPart["type"] }>()

const STYLES: Record<DebtPart["type"], string> = {
  linear: "bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300",
  annuity: "bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300",
  interest_only: "bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300",
}
</script>

<template>
  <Badge :class="STYLES[type]">{{ PART_TYPE_LABELS[type] }}</Badge>
</template>
