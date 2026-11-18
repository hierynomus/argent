<script setup lang="ts">
import { ref } from "vue"
import Button from "./Button.vue"

/**
 * A destructive action that needs a second click.
 *
 *   <ConfirmButton label="Delete mortgage" prompt="Delete mortgage?" @confirm="…" />   → "Delete mortgage?  Yes  No"
 *   <ConfirmButton label="Delete" @confirm="…" />                                      → "Sure?  No"
 */
const props = defineProps<{
  label: string
  /** text shown before the Yes/No buttons; without it the confirm button itself reads "Sure?" */
  prompt?: string
  confirmLabel?: string
  disabled?: boolean
}>()
const emit = defineEmits<{
  confirm: []
  /** the user started the deletion (e.g. so the parent can close an edit form) */
  start: []
}>()

const confirming = ref(false)
function start() {
  emit("start")
  confirming.value = true
}
</script>

<template>
  <Button v-if="!confirming" variant="danger-link" size="xs" :disabled="disabled" @click="start">{{ label }}</Button>
  <template v-else>
    <span v-if="prompt" class="text-xs text-gray-500 dark:text-gray-400">{{ prompt }}</span>
    <button type="button" class="text-xs text-red-600 dark:text-red-400 font-medium" @click="emit('confirm')">
      {{ confirmLabel ?? (props.prompt ? "Yes" : "Sure?") }}
    </button>
    <button type="button" class="text-xs text-gray-400" @click="confirming = false">No</button>
  </template>
</template>
