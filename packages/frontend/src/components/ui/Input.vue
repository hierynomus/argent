<script setup lang="ts">
import { useField } from "./fieldContext"
import { CONTROL, PADDING, type Density } from "./controlClasses"

/**
 * Text / number / date input with `v-model`. `class` is for layout (e.g. a width); `density` controls padding.
 *
 * The model is always the raw string: Vue's own `v-model` on <input type=number> would cast to a JS
 * number, but amounts here are exact decimal strings ("1234.50") that go to the API as typed.
 */
withDefaults(defineProps<{ density?: Density }>(), { density: "md" })
const model = defineModel<string | number>()
const field = useField()
</script>

<template>
  <input
    :value="model"
    :id="field?.id.value"
    :aria-invalid="field?.invalid() ? true : undefined"
    :aria-describedby="field?.invalid() ? field.errorId.value : undefined"
    :class="[CONTROL, PADDING[density]]"
    @input="model = ($event.target as HTMLInputElement).value"
  />
</template>
