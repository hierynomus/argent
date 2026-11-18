<script setup lang="ts">
/** A table header cell. `dense` is the tighter padding used in nested/secondary tables. */
withDefaults(defineProps<{ align?: "left" | "right"; dense?: boolean }>(), { align: undefined, dense: false })
</script>

<template>
  <th class="px-4" :class="[dense ? 'py-2' : 'py-3', align === 'right' && 'text-right', align === 'left' && 'text-left']"><slot /></th>
</template>
