<script setup lang="ts">
import { computed, ref } from "vue"
import { useField } from "./fieldContext"
import { CONTROL, PADDING, type Density } from "./controlClasses"
import { usePopover } from "./usePopover"

/**
 * A date you can type (YYYY-MM-DD, or 31-12-2026 / 31/12/2026, tidied on leaving the field) and pick from a
 * themed calendar (the button, or Alt+↓). The browsers' own `type="date"` fields differ in whether they can be
 * typed in at all and cannot be themed, so every date in the app goes through this one. The model is the ISO
 * string, or whatever is typed while it is not a date (the shared zod schemas then explain what is wrong).
 */
defineOptions({ inheritAttrs: false })
withDefaults(defineProps<{ density?: Density }>(), { density: "md" })
const model = defineModel<string | number>()
const field = useField()

const wrapper = ref<HTMLElement | null>(null)
const panel = ref<HTMLElement | null>(null)
const { open, style, show, close } = usePopover(wrapper, panel)

const ISO = /^\d{4}-\d{2}-\d{2}$/
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

// calendar: the month on show, Monday first
const iso = (d: Date) => d.toISOString().slice(0, 10)
const today = () => { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}` }
const shown = ref({ y: 2026, m: 0 })
const selected = computed(() => (ISO.test(String(model.value ?? "")) ? String(model.value) : ""))
const monthName = computed(() => new Intl.DateTimeFormat("en", { month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(shown.value.y, shown.value.m, 1))))
const cells = computed(() => {
  const { y, m } = shown.value
  const offset = (new Date(Date.UTC(y, m, 1)).getUTCDay() + 6) % 7
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(Date.UTC(y, m, 1 - offset + i))
    return { iso: iso(d), day: d.getUTCDate(), outside: d.getUTCMonth() !== m }
  })
})
function step(months: number) {
  const t = shown.value.y * 12 + shown.value.m + months
  shown.value = { y: Math.floor(t / 12), m: t % 12 }
}
function openCalendar() {
  const base = selected.value || today()
  shown.value = { y: Number(base.slice(0, 4)), m: Number(base.slice(5, 7)) - 1 }
  show()
}
function choose(d: string) {
  model.value = d
  close()
}
const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"]
const NAV = "p-1 rounded-sm text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
</script>

<template>
  <div ref="wrapper" :class="['relative inline-block', $attrs.class]" :style="$attrs.style as any">
    <input
      v-bind="{ ...$attrs, class: undefined, style: undefined }"
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
      @keydown.alt.down.prevent="openCalendar"
    />
    <button
      type="button"
      tabindex="-1"
      aria-label="Pick a date"
      class="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-300"
      @click="open ? close() : openCalendar()"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>
    </button>

    <Teleport to="body">
      <div v-if="open" ref="panel" :style="style" role="dialog" aria-label="Choose a date" class="fixed z-[60] w-64 p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-lg text-sm">
        <div class="flex items-center justify-between mb-2">
          <div class="flex">
            <button type="button" :class="NAV" aria-label="Previous year" @click="step(-12)">«</button>
            <button type="button" :class="NAV" aria-label="Previous month" @click="step(-1)">‹</button>
          </div>
          <span class="font-medium text-gray-900 dark:text-gray-100">{{ monthName }} {{ shown.y }}</span>
          <div class="flex">
            <button type="button" :class="NAV" aria-label="Next month" @click="step(1)">›</button>
            <button type="button" :class="NAV" aria-label="Next year" @click="step(12)">»</button>
          </div>
        </div>
        <div class="grid grid-cols-7 text-center text-xs text-gray-400 dark:text-gray-500 mb-1">
          <span v-for="w in WEEKDAYS" :key="w" class="py-1">{{ w }}</span>
        </div>
        <div class="grid grid-cols-7 gap-0.5">
          <button
            v-for="c in cells"
            :key="c.iso"
            type="button"
            :aria-label="c.iso"
            :aria-pressed="c.iso === selected"
            :class="[
              'h-8 rounded-md text-center tabular-nums',
              c.iso === selected ? 'bg-indigo-600 text-white font-medium' : c.outside ? 'text-gray-300 dark:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800' : 'text-gray-800 dark:text-gray-100 hover:bg-indigo-50 dark:hover:bg-indigo-950',
              c.iso === today() && c.iso !== selected ? 'ring-1 ring-indigo-400' : '',
            ]"
            @click="choose(c.iso)"
          >{{ c.day }}</button>
        </div>
        <div class="flex justify-between mt-2 pt-2 border-t border-gray-100 dark:border-gray-800">
          <button type="button" class="text-xs text-indigo-600 dark:text-indigo-400 hover:underline" @click="choose(today())">Today</button>
          <button type="button" class="text-xs text-gray-500 dark:text-gray-400 hover:underline" @click="choose('')">Clear</button>
        </div>
      </div>
    </Teleport>
  </div>
</template>
