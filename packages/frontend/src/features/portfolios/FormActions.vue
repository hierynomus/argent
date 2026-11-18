<script setup lang="ts">
import { Button, ErrorText } from "../../components/ui"

/** Submit + Cancel row at the bottom of a form, with the server error (if any). */
withDefaults(defineProps<{ submitLabel: string; pendingLabel?: string; pending: boolean; error?: unknown }>(), { pendingLabel: "Saving…" })
defineEmits<{ cancel: [] }>()
</script>

<template>
  <div class="flex gap-2 pt-3">
    <Button type="submit" size="sm" class="rounded-lg px-4" :disabled="pending">{{ pending ? pendingLabel : submitLabel }}</Button>
    <Button variant="muted-link" size="sm" class="rounded-lg px-4 hover:bg-gray-100 dark:hover:bg-gray-800 hover:no-underline" @click="$emit('cancel')">Cancel</Button>
  </div>
  <ErrorText :error="error" />
</template>
