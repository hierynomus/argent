import type { Directive } from "vue"

/** `v-focus`: focuses the element when it appears (the equivalent of React's `autoFocus`). */
export const vFocus: Directive<HTMLElement> = { mounted: (el) => el.focus() }
