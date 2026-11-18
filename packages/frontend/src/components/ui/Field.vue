<script setup lang="ts">
import { computed, ref, useId } from "vue"
import { provideField } from "./fieldContext"

/**
 * A labelled form control. The label is associated with the control inside it (`for`/`id`), so it is
 * announced by screen readers and clicking it focuses the control. An `error` is shown under the
 * control and linked to it (`aria-invalid`, `aria-describedby`).
 *
 *   <Field label="Start date" :error="errors.startDate"><Input type="date" v-model="…" /></Field>
 */
const props = defineProps<{ label: string; error?: string }>()

const generated = useId()
const customId = ref<string>()
const id = computed(() => customId.value ?? generated)
const errorId = computed(() => `${id.value}-error`)
provideField({ id, errorId, invalid: () => !!props.error, setCustomId: (v) => (customId.value = v) })
</script>

<template>
  <div>
    <label :for="id" class="block text-xs text-gray-500 dark:text-gray-400 mb-1">{{ label }}</label>
    <slot />
    <p v-if="error" :id="errorId" role="alert" class="text-xs text-red-600 dark:text-red-400 mt-1">{{ error }}</p>
  </div>
</template>
