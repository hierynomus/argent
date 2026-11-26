<script setup lang="ts">
import { nextTick, onMounted, onUpdated, ref, watch } from "vue"
import { useField } from "./fieldContext"
import { CONTROL, PADDING, type Density } from "./controlClasses"
import { usePopover } from "./usePopover"

/**
 * Dropdown with `v-model` and plain `<option>` children. The native <select> stays in the DOM (hidden) as the
 * source of truth for options, value and change events; what you see and click is a themed button and list,
 * because the browser's own dropdown list cannot be styled.
 */
defineOptions({ inheritAttrs: false })
withDefaults(defineProps<{ density?: Density }>(), { density: "md" })
const model = defineModel<string>()
const field = useField()

const wrapper = ref<HTMLElement | null>(null)
const native = ref<HTMLSelectElement | null>(null)
const button = ref<HTMLButtonElement | null>(null)
const panel = ref<HTMLElement | null>(null)
const { open, style, show, close } = usePopover(wrapper, panel)

interface Item { value: string; text: string; disabled: boolean }
const items = ref<Item[]>([])
const label = ref("")
const active = ref(-1)

function read() {
  const sel = native.value
  if (!sel) return
  items.value = Array.from(sel.options).map((o) => ({ value: o.value, text: o.text, disabled: o.disabled }))
  label.value = (sel.options[sel.selectedIndex] ?? sel.options[0])?.text ?? ""
}
onMounted(read)
onUpdated(read)
watch(model, () => nextTick(read))

async function openList() {
  read()
  active.value = Math.max(0, items.value.findIndex((i) => i.value === native.value?.value))
  await show()
  await nextTick()
  panel.value?.querySelector<HTMLElement>("[data-active='true']")?.scrollIntoView({ block: "nearest" })
}
function pick(i: number) {
  const item = items.value[i]
  if (!item || item.disabled || !native.value) return
  native.value.value = item.value
  native.value.dispatchEvent(new Event("change", { bubbles: true }))
  close()
  button.value?.focus()
}
function move(d: number) {
  let i = active.value
  for (let n = 0; n < items.value.length; n++) {
    i = (i + d + items.value.length) % items.value.length
    if (!items.value[i]!.disabled) break
  }
  active.value = i
  nextTick(() => panel.value?.querySelector<HTMLElement>("[data-active='true']")?.scrollIntoView({ block: "nearest" }))
}
let typed = ""
let typedTimer: ReturnType<typeof setTimeout> | undefined
function onKey(e: KeyboardEvent) {
  if (!open.value) {
    if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) { e.preventDefault(); openList() }
    return
  }
  if (e.key === "ArrowDown") { e.preventDefault(); move(1) }
  else if (e.key === "ArrowUp") { e.preventDefault(); move(-1) }
  else if (e.key === "Home") { e.preventDefault(); active.value = 0 }
  else if (e.key === "End") { e.preventDefault(); active.value = items.value.length - 1 }
  else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(active.value) }
  else if (e.key === "Tab") close()
  else if (e.key.length === 1) {
    typed += e.key.toLowerCase()
    clearTimeout(typedTimer)
    typedTimer = setTimeout(() => (typed = ""), 600)
    const hit = items.value.findIndex((i) => i.text.toLowerCase().startsWith(typed))
    if (hit >= 0) active.value = hit
  }
}
</script>

<template>
  <div ref="wrapper" tabindex="-1" :class="['relative inline-block', $attrs.class]" :style="$attrs.style as any" @focus="button?.focus()">
    <select
      ref="native"
      v-model="model"
      v-bind="{ ...$attrs, class: undefined, style: undefined }"
      :id="field?.id.value"
      :aria-invalid="field?.invalid() ? true : undefined"
      :aria-describedby="field?.invalid() ? field.errorId.value : undefined"
      tabindex="-1"
      class="sr-only"
      @focus="button?.focus()"
    >
      <slot />
    </select>
    <button
      ref="button"
      type="button"
      aria-haspopup="listbox"
      :aria-expanded="open"
      :class="[CONTROL, PADDING[density], 'w-full flex items-center justify-between gap-2 text-left']"
      @click="open ? close() : openList()"
      @keydown="onKey"
    >
      <span class="truncate min-h-5">{{ label }}</span>
      <span v-if="!label" class="sr-only">{{ $attrs["aria-label"] || "Choose" }}</span>
      <svg class="w-3.5 h-3.5 shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" /></svg>
    </button>
    <Teleport to="body">
      <ul
        v-if="open"
        ref="panel"
        role="listbox"
        :style="style"
        class="fixed z-[60] max-h-60 overflow-auto py-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-lg text-sm"
      >
        <li
          v-for="(item, i) in items"
          :key="item.value + i"
          role="option"
          :aria-selected="item.value === native?.value"
          :aria-disabled="item.disabled || undefined"
          :data-active="i === active"
          :class="[
            'px-3 py-1.5 flex items-center justify-between gap-3 cursor-pointer whitespace-nowrap',
            item.disabled ? 'text-gray-300 dark:text-gray-600 cursor-not-allowed' : 'text-gray-800 dark:text-gray-100',
            i === active && !item.disabled ? 'bg-indigo-50 dark:bg-indigo-950' : '',
            item.value === native?.value ? 'font-medium text-indigo-700 dark:text-indigo-300' : '',
          ]"
          @mouseenter="active = i"
          @mousedown.prevent
          @click="pick(i)"
        >
          <span>{{ item.text || " " }}</span>
          <svg v-if="item.value === native?.value" class="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" /></svg>
        </li>
      </ul>
    </Teleport>
  </div>
</template>
