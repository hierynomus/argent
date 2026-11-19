<script setup lang="ts">
/**
 * A table body cell, the counterpart of `Th`. `dense` is the tighter padding of nested/secondary tables,
 * `mono` the monospaced figures of money columns, and `tone` the text colour: `strong` for the figure that
 * matters, `normal`, `muted` for secondary figures and `faint` for small print.
 */
withDefaults(defineProps<{ align?: "left" | "right"; dense?: boolean; mono?: boolean; tone?: "strong" | "normal" | "muted" | "faint" }>(), {
  align: undefined,
  dense: false,
  mono: false,
  tone: undefined,
})

const TONES = {
  strong: "text-gray-900 dark:text-gray-100",
  normal: "text-gray-700 dark:text-gray-300",
  muted: "text-gray-600 dark:text-gray-400",
  faint: "text-gray-500 dark:text-gray-400",
} as const
</script>

<template>
  <td class="px-4" :class="[dense ? 'py-2' : 'py-3', align === 'right' && 'text-right', align === 'left' && 'text-left', mono && 'font-mono', tone && TONES[tone]]"><slot /></td>
</template>
