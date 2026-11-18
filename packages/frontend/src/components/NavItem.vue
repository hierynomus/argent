<script setup lang="ts">
import { RouterLink } from "vue-router"
import Icon, { type IconName } from "./Icon.vue"

defineProps<{ to: string; icon: IconName; label: string; showLabel: boolean }>()
</script>

<template>
  <RouterLink
    v-slot="{ href, navigate, isActive }"
    custom
    :to="to"
  >
    <a
      :href="href"
      :title="showLabel ? undefined : label"
      :aria-current="isActive ? 'page' : undefined"
      class="flex items-center gap-3 rounded-lg px-3 py-2 transition-colors"
      :class="isActive ? 'bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100'"
      @click="navigate"
    >
      <Icon :name="icon" />
      <span v-if="showLabel" class="text-sm font-medium truncate">{{ label }}</span>
    </a>
  </RouterLink>
</template>
