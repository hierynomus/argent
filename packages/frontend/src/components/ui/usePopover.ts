import { nextTick, onBeforeUnmount, ref, type Ref } from "vue"

/**
 * A floating panel under (or, when there is no room, above) a trigger, teleported to <body> so no
 * `overflow-hidden` ancestor clips it. Closes on a click elsewhere, Escape, resize and scrolling outside it.
 */
export function usePopover(trigger: Ref<HTMLElement | null>, panel: Ref<HTMLElement | null>) {
  const open = ref(false)
  const style = ref<Record<string, string>>({})

  function place() {
    const t = trigger.value
    if (!t) return
    const r = t.getBoundingClientRect()
    const h = panel.value?.offsetHeight ?? 240
    const below = window.innerHeight - r.bottom
    const up = below < h + 8 && r.top > below
    const width = panel.value?.offsetWidth ?? r.width
    const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8))
    style.value = {
      left: `${left}px`,
      minWidth: `${r.width}px`,
      ...(up ? { bottom: `${window.innerHeight - r.top + 4}px` } : { top: `${r.bottom + 4}px` }),
    }
  }
  const onDown = (e: MouseEvent) => {
    const n = e.target as Node
    if (!panel.value?.contains(n) && !trigger.value?.contains(n)) close()
  }
  const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && open.value) { close(); trigger.value?.querySelector<HTMLElement>("button, input")?.focus() } }
  const onScroll = (e: Event) => { if (!panel.value?.contains(e.target as Node)) close() }

  async function show() {
    place()
    open.value = true
    document.addEventListener("mousedown", onDown)
    document.addEventListener("keydown", onKey)
    window.addEventListener("resize", close)
    window.addEventListener("scroll", onScroll, true)
    await nextTick()
    place()
  }
  function close() {
    open.value = false
    document.removeEventListener("mousedown", onDown)
    document.removeEventListener("keydown", onKey)
    window.removeEventListener("resize", close)
    window.removeEventListener("scroll", onScroll, true)
  }
  onBeforeUnmount(close)
  return { open, style, show, close, toggle: () => (open.value ? close() : show()) }
}
