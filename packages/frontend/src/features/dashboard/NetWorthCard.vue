<script setup lang="ts">
import { Card } from "../../components/ui"
import { fmtCur } from "../../lib/format"
import Skeleton from "./Skeleton.vue"

defineProps<{ netWorth: number; totalAssets: number; totalLiabilities: number; loading: boolean; hasNonEurAssets: boolean }>()
</script>

<template>
  <Card size="xl" class="px-8 py-7">
    <p class="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-3">Net Worth</p>
    <div class="flex flex-wrap items-end gap-6">
      <div>
        <Skeleton v-if="loading" class="h-12 w-48" />
        <p v-else class="text-5xl font-bold tracking-tight" :class="netWorth >= 0 ? 'text-gray-900 dark:text-gray-100' : 'text-red-600 dark:text-red-400'">{{ fmtCur(netWorth) }}</p>
      </div>
      <div class="flex gap-6 pb-1 text-sm text-gray-500 dark:text-gray-400">
        <div>
          <span class="text-gray-400 dark:text-gray-500 mr-1.5">Assets</span>
          <Skeleton v-if="loading" class="inline-block h-4 w-24 align-middle" />
          <span v-else class="font-semibold text-gray-700 dark:text-gray-300">{{ fmtCur(totalAssets) }}</span>
        </div>
        <div>
          <span class="text-gray-400 dark:text-gray-500 mr-1.5">Liabilities</span>
          <Skeleton v-if="loading" class="inline-block h-4 w-24 align-middle" />
          <span v-else class="font-semibold text-gray-700 dark:text-gray-300">{{ fmtCur(totalLiabilities) }}</span>
        </div>
      </div>
    </div>
    <p v-if="hasNonEurAssets && !loading" class="text-xs text-amber-600 dark:text-amber-400 mt-3">* Non-EUR portfolios are excluded from this total.</p>
  </Card>
</template>
