<script setup lang="ts">
import { computed, ref } from "vue"

export interface ChartPoint {
  /** Unix timestamp, milliseconds */
  t: number
  v: number
}
export interface ChartMarker {
  t: number
  v: number
  kind: "buy" | "sell"
  /** shown as the marker's tooltip, e.g. "Bought 0.5 BTC at €30.000,00" */
  label: string
}

/**
 * A single-series line chart in plain SVG: thin line, recessive grid, a hover crosshair with a tooltip
 * (also reachable with the arrow keys), and optional buy/sell markers (▲ / ▼: shape + colour, never
 * colour alone). Colours come from Tailwind classes so light and dark mode both work.
 */
const props = defineProps<{
  points: ChartPoint[]
  markers?: ChartMarker[]
  formatValue: (v: number) => string
  formatDate: (t: number) => string
  /** accessible name of the chart, e.g. "Bitcoin price, last year" */
  label: string
  /** draw a step line (the value stays flat until the next point) instead of straight segments */
  step?: boolean
}>()

const W = 720
const H = 260
const M = { top: 10, right: 14, bottom: 26, left: 84 }
const innerW = W - M.left - M.right
const innerH = H - M.top - M.bottom

const domain = computed(() => {
  const ts = props.points.map((p) => p.t)
  const vs = props.points.map((p) => p.v)
  const t0 = Math.min(...ts)
  const t1 = Math.max(...ts)
  const vmin = Math.min(...vs)
  const vmax = Math.max(...vs)
  const pad = ((vmax - vmin) || Math.abs(vmax) * 0.05 || 1) * 0.08
  return { t0, t1, lo: vmin - pad, hi: vmax + pad }
})
const x = (t: number) => M.left + (domain.value.t1 === domain.value.t0 ? innerW / 2 : ((t - domain.value.t0) / (domain.value.t1 - domain.value.t0)) * innerW)
const y = (v: number) => M.top + innerH - ((v - domain.value.lo) / (domain.value.hi - domain.value.lo)) * innerH

const path = computed(() =>
  props.points
    .map((p, i) => {
      const px = x(p.t).toFixed(1)
      const py = y(p.v).toFixed(1)
      if (i === 0) return `M${px} ${py}`
      // a step line holds the previous value until this point's date, then jumps
      return props.step ? `H${px} V${py}` : `L${px} ${py}`
    })
    .join(" "),
)
const yTicks = computed(() => Array.from({ length: 5 }, (_, i) => domain.value.lo + ((domain.value.hi - domain.value.lo) * i) / 4))
const xTicks = computed(() => Array.from({ length: 5 }, (_, i) => domain.value.t0 + ((domain.value.t1 - domain.value.t0) * i) / 4))

const visibleMarkers = computed(() => (props.markers ?? []).filter((m) => m.t >= domain.value.t0 && m.t <= domain.value.t1))

// hover / keyboard
const hover = ref<number | null>(null)
const svg = ref<SVGSVGElement | null>(null)
function nearest(px: number): number {
  let best = 0
  let bestDist = Infinity
  props.points.forEach((p, i) => {
    const d = Math.abs(x(p.t) - px)
    if (d < bestDist) {
      best = i
      bestDist = d
    }
  })
  return best
}
function onMove(e: PointerEvent) {
  const rect = svg.value!.getBoundingClientRect()
  hover.value = nearest(((e.clientX - rect.left) / rect.width) * W)
}
function onKey(e: KeyboardEvent) {
  const last = props.points.length - 1
  const from = hover.value ?? (e.key === "ArrowLeft" ? last + 1 : -1)
  if (e.key === "ArrowRight") hover.value = Math.min(last, from + 1)
  else if (e.key === "ArrowLeft") hover.value = Math.max(0, from - 1)
  else if (e.key === "Home") hover.value = 0
  else if (e.key === "End") hover.value = last
  else if (e.key === "Escape") hover.value = null
  else return
  e.preventDefault()
}
const current = computed(() => (hover.value === null ? null : props.points[hover.value] ?? null))
const tooltipStyle = computed(() => {
  if (!current.value) return {}
  const left = (x(current.value.t) / W) * 100
  return { left: `${left}%`, top: `${(y(current.value.v) / H) * 100}%`, transform: left > 60 ? "translate(calc(-100% - 12px), -50%)" : "translate(12px, -50%)" }
})
</script>

<template>
  <div
    class="relative select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded"
    tabindex="0"
    role="group"
    :aria-label="`${label}. Use the left and right arrow keys to read values.`"
    @keydown="onKey"
    @blur="hover = null"
  >
    <svg ref="svg" :viewBox="`0 0 ${W} ${H}`" class="w-full h-auto block" role="img" :aria-label="label" @pointermove="onMove" @pointerleave="hover = null">
      <!-- grid + y axis -->
      <g class="text-[11px]">
        <g v-for="v in yTicks" :key="v">
          <line :x1="M.left" :x2="W - M.right" :y1="y(v)" :y2="y(v)" class="stroke-gray-200 dark:stroke-gray-800" stroke-width="1" />
          <text :x="M.left - 8" :y="y(v)" text-anchor="end" dominant-baseline="middle" class="fill-gray-500 dark:fill-gray-400">{{ formatValue(v) }}</text>
        </g>
        <text v-for="(t, i) in xTicks" :key="t" :x="x(t)" :y="H - 8" :text-anchor="i === 0 ? 'start' : i === xTicks.length - 1 ? 'end' : 'middle'" class="fill-gray-500 dark:fill-gray-400">{{ formatDate(t) }}</text>
      </g>

      <path :d="path" fill="none" class="stroke-indigo-600 dark:stroke-indigo-400" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />

      <!-- trades -->
      <g v-for="(m, i) in visibleMarkers" :key="i">
        <path
          :d="m.kind === 'buy' ? `M${x(m.t)} ${y(m.v) - 7} L${x(m.t) - 6} ${y(m.v) + 4} L${x(m.t) + 6} ${y(m.v) + 4} Z` : `M${x(m.t)} ${y(m.v) + 7} L${x(m.t) - 6} ${y(m.v) - 4} L${x(m.t) + 6} ${y(m.v) - 4} Z`"
          :class="m.kind === 'buy' ? 'fill-green-600 dark:fill-green-400' : 'fill-red-600 dark:fill-red-400'"
          class="stroke-white dark:stroke-gray-900"
          stroke-width="1.5"
          data-testid="trade-marker"
        >
          <title>{{ m.label }}</title>
        </path>
      </g>

      <!-- hover -->
      <g v-if="current" pointer-events="none">
        <line :x1="x(current.t)" :x2="x(current.t)" :y1="M.top" :y2="M.top + innerH" class="stroke-gray-400 dark:stroke-gray-500" stroke-width="1" stroke-dasharray="3 3" />
        <circle :cx="x(current.t)" :cy="y(current.v)" r="4" class="fill-indigo-600 dark:fill-indigo-400 stroke-white dark:stroke-gray-900" stroke-width="2" />
      </g>
    </svg>

    <div v-if="current" class="absolute pointer-events-none z-10 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow px-2.5 py-1.5 text-xs whitespace-nowrap" :style="tooltipStyle" data-testid="chart-tooltip">
      <div class="text-gray-500 dark:text-gray-400">{{ formatDate(current.t) }}</div>
      <div class="font-medium text-gray-900 dark:text-gray-100 tabular-nums">{{ formatValue(current.v) }}</div>
    </div>
    <!-- screen readers hear the value under the cursor / keyboard focus -->
    <span class="sr-only" aria-live="polite">{{ current ? `${formatDate(current.t)}: ${formatValue(current.v)}` : "" }}</span>
  </div>
</template>
