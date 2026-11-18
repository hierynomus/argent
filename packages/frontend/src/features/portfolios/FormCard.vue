<script setup lang="ts">
import { Card } from "../../components/ui"
/** The bordered card + <form> that wraps every "record something" form. Emits `submit` (default prevented). */
defineEmits<{ submit: [] }>()
</script>

<template>
  <Card as="form" class="p-4 mb-4" @submit.prevent="$emit('submit')">
    <slot />
  </Card>
</template>
