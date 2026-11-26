<script setup lang="ts">
import { ref } from "vue"
import { useField } from "./fieldContext"
import { CONTROL, PADDING, type Density } from "./controlClasses"

/**
 * A date you can type (YYYY-MM-DD, or 31-12-2026 / 31/12/2026, tidied on leaving the field) and pick from a
 * calendar (the button). The browsers' own `type="date"` fields differ in whether they can be typed in at all,
 * so every date in the app goes through this one. The model is the ISO string, or whatever is typed while it
 * is not a date (the shared zod schemas then explain what is wrong).
 */
defineOptions({ inheritAttrs: false })
withDefaults(defineProps<{ density?: Density }>(), { density: "md" })
const model = defineModel<string | number>()
const field = useField()
const picker = ref<HTMLInputElement | null>(null)

const pad = (n: string) => n.padStart(2, "0")
/** "31-12-2026", "31/12/2026" and "2026/12/31" become "2026-12-31"; anything else is left alone. */
function tidyDate(raw: string): string {
  const s = raw.trim()
  const dmy = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(s)
  if (dmy) return `${dmy[3]}-${pad(dmy[2]!)}-${pad(dmy[1]!)}`
  const ymd = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(s)
  if (ymd) return `${ymd[1]}-${pad(ymd[2]!)}-${pad(ymd[3]!)}`
  return s
}

function onBlur(e: FocusEvent) {
  const el = e.target as HTMLInputElement
  const tidy = tidyDate(el.value)
  if (tidy !== el.value) {
    el.value = tidy
    model.value = tidy
  }
}
function openPicker() {
  const el = picker.value
  if (!el) return
  el.value = /^\d{4}-\d{2}-\d{2}$/.test(String(model.value ?? "")) ? String(model.value) : ""
  try { el.showPicker() } catch { el.focus(); el.click() }
}
</script>

<template>
  <div :class="['relative inline-block', $attrs.class]">
    <input
      v-bind="{ ...$attrs, class: undefined }"
      type="text"
      inputmode="numeric"
      autocomplete="off"
      placeholder="YYYY-MM-DD"
      maxlength="10"
      :value="model"
      :id="field?.id.value"
      :aria-invalid="field?.invalid() ? true : undefined"
      :aria-describedby="field?.invalid() ? field.errorId.value : undefined"
      :class="[CONTROL, PADDING[density], 'w-full pr-8']"
      @input="model = ($event.target as HTMLInputElement).value"
      @blur="onBlur"
    />
    <button
      type="button"
      tabindex="-1"
      aria-label="Pick a date"
      class="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
      @click="openPicker"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>
    </button>
    <input
      ref="picker"
      type="date"
      tabindex="-1"
      aria-hidden="true"
      class="absolute right-0 bottom-0 w-0 h-0 opacity-0 pointer-events-none"
      @change="model = ($event.target as HTMLInputElement).value; $event.stopPropagation()"
    />
  </div>
</template>
