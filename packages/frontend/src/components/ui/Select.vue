<script setup lang="ts">
import { useField } from "./fieldContext"
import { CONTROL, PADDING, type Density } from "./controlClasses"

withDefaults(defineProps<{ density?: Density }>(), { density: "md" })
const model = defineModel<string>()
const field = useField()
</script>

<template>
  <select
    v-model="model"
    :id="field?.id.value"
    :aria-invalid="field?.invalid() ? true : undefined"
    :aria-describedby="field?.invalid() ? field.errorId.value : undefined"
    :class="[CONTROL, PADDING[density]]"
  >
    <slot />
  </select>
</template>
