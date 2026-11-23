<script setup lang="ts">
import { computed } from "vue"

export type ButtonVariant = "primary" | "secondary" | "link" | "danger-link" | "muted-link"

const props = withDefaults(
  defineProps<{
    variant?: ButtonVariant
    /** padding/text size; links default to unpadded, buttons to `sm` */
    size?: "xs" | "sm" | "md"
    /** defaults to "button" so a button inside a <form> never submits by accident */
    type?: "button" | "submit" | "reset"
  }>(),
  { variant: "primary", type: "button" },
)

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "rounded-sm bg-indigo-600 text-white font-medium hover:bg-indigo-700 disabled:opacity-50",
  secondary:
    "rounded-sm border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50",
  link: "text-indigo-600 dark:text-indigo-400 hover:underline font-medium",
  "danger-link": "text-red-500 hover:text-red-700 dark:hover:text-red-400 disabled:opacity-50",
  "muted-link": "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200",
}
const SIZES = { sm: "px-3 py-1.5 text-sm", md: "px-4 py-2 text-sm", xs: "text-xs" } as const

const classes = computed(() => {
  const size = props.size ?? (props.variant === "primary" || props.variant === "secondary" ? "sm" : undefined)
  return [VARIANTS[props.variant], size && SIZES[size]]
})
</script>

<template>
  <button :type="type" :class="classes"><slot /></button>
</template>
