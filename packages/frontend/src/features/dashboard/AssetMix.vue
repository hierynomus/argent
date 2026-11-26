<script setup lang="ts">
import { fmtCur } from "../../lib/format"
import type { AssetSlice } from "./summarize"

/**
 * What the assets are made of: one bar split per asset class (with a small gap between pieces) and a legend that
 * carries the name, amount and share of each, so the colours are never the only way to tell them apart.
 */
defineProps<{ slices: AssetSlice[] }>()

const COLOR: Record<AssetSlice["key"], string> = {
  banking: "bg-indigo-500 dark:bg-indigo-400",
  stocks: "bg-sky-500 dark:bg-sky-400",
  crypto: "bg-orange-500 dark:bg-orange-400",
  metals: "bg-stone-400 dark:bg-stone-300",
  property: "bg-emerald-600 dark:bg-emerald-400",
  options: "bg-violet-500 dark:bg-violet-400",
  pensions: "bg-pink-500 dark:bg-pink-400",
}
const share = (p: number) => (p >= 10 ? p.toFixed(0) : p >= 1 ? p.toFixed(1) : "<1")
</script>

<template>
  <div v-if="slices.length > 0" class="mt-6" aria-label="Assets by class">
    <div class="flex h-3 gap-0.5 rounded-full overflow-hidden" role="img" :aria-label="`Assets: ${slices.map((s) => `${s.label} ${share(s.percent)}%`).join(', ')}`">
      <div v-for="s in slices" :key="s.key" :class="COLOR[s.key]" :style="{ width: `${s.percent}%`, minWidth: '4px' }" :title="`${s.label}: ${fmtCur(s.value)}`" />
    </div>
    <ul class="mt-3 flex flex-wrap gap-x-8 gap-y-2 text-sm">
      <li v-for="s in slices" :key="s.key" class="flex items-start gap-2 min-w-[7.5rem]">
        <span class="mt-1.5 w-2.5 h-2.5 rounded-full shrink-0" :class="COLOR[s.key]" aria-hidden="true" />
        <span class="min-w-0">
          <span class="block text-xs text-gray-500 dark:text-gray-400 truncate">{{ s.label }} · {{ share(s.percent) }}%</span>
          <span class="block font-semibold tabular-nums text-gray-800 dark:text-gray-200">{{ fmtCur(s.value) }}</span>
        </span>
      </li>
    </ul>
  </div>
</template>
