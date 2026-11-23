<script setup lang="ts" generic="K extends PortfolioKind">
import { computed, ref, useSlots } from "vue"
import { useMutation } from "@tanstack/vue-query"
import { portfolioApis, useInvalidate, usePortfolio, usePortfolioDetails, usePortfolios, type PortfolioDetailByKind, type PortfolioKind } from "../../api"
import { Button, EmptyState, ErrorText, Input, LoadingText, SegmentedControl, vFocus } from "../../components/ui"
import PortfolioActions from "./PortfolioActions.vue"

/**
 * The shell shared by Crypto, Precious Metals and Stocks: list of portfolios as tabs, the "new
 * portfolio" form, and the owner actions (share / delete) under the selected portfolio.
 * What a portfolio *contains* is the default slot, which receives the selected `portfolio`.
 * With several portfolios, an "Overview" tab comes first (and is the default) when the page provides the
 * `overview` slot: it receives the details of every portfolio the user can see, to sum them up.
 */
const props = defineProps<{
  kind: K
  title: string
  /** used in the empty state: "No {emptyNoun} portfolio yet." */
  emptyNoun: string
  /** stock portfolios belong to a broker */
  withBroker?: boolean
  /** crypto and stock portfolios have a cash account behind them (metals do not) */
  withAccount?: boolean
}>()
defineSlots<{
  default(props: { portfolio: PortfolioDetailByKind[K] }): unknown
  overview?(props: { details: PortfolioDetailByKind[K][]; loading: boolean }): unknown
}>()
const slots = useSlots()

const invalidate = useInvalidate()
const { data: listData, isLoading: loadingList } = usePortfolios(props.kind)
const portfolios = computed(() => listData.value ?? [])

/** "overview" or a portfolio id; null = the default (the overview when there is one, else the first portfolio) */
const OVERVIEW = "overview"
const selectedId = ref<string | null>(null)
const hasOverview = computed(() => !!slots.overview && portfolios.value.length > 1)
const view = computed(() => {
  const chosen = selectedId.value
  if (chosen && chosen !== OVERVIEW && portfolios.value.some((p) => p.id === chosen)) return chosen
  if (chosen === OVERVIEW && hasOverview.value) return OVERVIEW
  return hasOverview.value ? OVERVIEW : portfolios.value[0]?.id ?? null
})
const showOverview = computed(() => view.value === OVERVIEW)
const activeId = computed(() => (showOverview.value ? null : view.value))
const { data: detail, isLoading: loadingDetail } = usePortfolio(props.kind, activeId)
const portfolio = computed(() => detail.value as PortfolioDetailByKind[K] | undefined)

// the overview needs every portfolio's detail (shared with the single-portfolio view through the cache)
const overviewDetails = usePortfolioDetails(props.kind, () => (showOverview.value ? portfolios.value : []))
const overviewLoading = computed(() => overviewDetails.value.some((q) => q.isLoading))
const overviewData = computed(() => overviewDetails.value.map((q) => q.data).filter((d): d is NonNullable<typeof d> => !!d) as PortfolioDetailByKind[K][])

const creating = ref(false)
const name = ref("")
const currency = ref<"EUR" | "USD">("EUR")
const broker = ref("")
const accountNumber = ref("")

const create = useMutation({
  mutationFn: () =>
    portfolioApis[props.kind].create({ name: name.value.trim(), currency: currency.value, broker: props.withBroker ? broker.value.trim() || undefined : undefined, accountNumber: props.withAccount ? accountNumber.value.trim() || undefined : undefined }),
  onSuccess: (created) => {
    invalidate.portfolios(props.kind)
    selectedId.value = created.id
    name.value = ""
    broker.value = ""
    accountNumber.value = ""
    creating.value = false
  },
})

function handleCreate() {
  if (name.value.trim()) create.mutate()
}
</script>

<template>
  <LoadingText v-if="loadingList" />

  <div v-else-if="portfolios.length === 0 && !creating" class="max-w-lg">
    <h1 class="text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-6">{{ title }}</h1>
    <EmptyState :title="`No ${emptyNoun} portfolio yet.`">
      <Button size="md" class="rounded-lg mt-4" @click="creating = true">Create portfolio</Button>
    </EmptyState>
  </div>

  <div v-else>
    <div class="flex items-center justify-between mb-6">
      <h1 class="text-2xl font-semibold text-gray-900 dark:text-gray-100">{{ title }}</h1>
      <Button size="sm" class="rounded-lg" @click="creating = true">+ New portfolio</Button>
    </div>

    <form v-if="creating" class="mb-6 flex gap-2 flex-wrap items-center" @submit.prevent="handleCreate">
      <Input v-model="name" v-focus density="lg" placeholder="Portfolio name" aria-label="Portfolio name" class="flex-1 min-w-40 py-2! rounded-lg" />
      <Input v-if="withBroker" v-model="broker" density="lg" placeholder="Broker (e.g. DEGIRO)" aria-label="Broker" class="flex-1 min-w-40 py-2! rounded-lg" />
      <Input v-if="withAccount" v-model="accountNumber" density="lg" placeholder="Account number (optional)" aria-label="Account number" class="flex-1 min-w-40 py-2! rounded-lg" />
      <SegmentedControl v-model="currency" :options="['EUR', 'USD'] as const" padding="px-3 py-2 font-medium" class="rounded-lg" />
      <Button type="submit" size="md" class="rounded-lg" :disabled="create.isPending.value">Create</Button>
      <Button variant="muted-link" size="md" class="rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800" @click="creating = false">Cancel</Button>
      <ErrorText :error="create.error.value" />
    </form>

    <div v-if="portfolios.length > 1" class="flex gap-2 mb-6 border-b border-gray-200 dark:border-gray-700">
      <button
        v-if="hasOverview"
        type="button"
        :aria-pressed="showOverview"
        class="px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors"
        :class="showOverview ? 'border-indigo-500 text-indigo-700 dark:text-indigo-300' : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'"
        @click="selectedId = OVERVIEW"
      >
        Overview
      </button>
      <button
        v-for="p in portfolios"
        :key="p.id"
        type="button"
        class="px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors"
        :aria-pressed="activeId === p.id"
        :class="
          activeId === p.id
            ? 'border-indigo-500 text-indigo-700 dark:text-indigo-300'
            : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
        "
        @click="selectedId = p.id"
      >
        {{ p.name }}<span v-if="p.broker" class="ml-1.5 text-xs text-gray-400 dark:text-gray-500">({{ p.broker }})</span>
      </button>
    </div>

    <template v-if="showOverview">
      <LoadingText v-if="overviewLoading && overviewData.length === 0">Loading portfolios…</LoadingText>
      <slot name="overview" :details="overviewData" :loading="overviewLoading" />
    </template>
    <template v-else>
      <LoadingText v-if="loadingDetail">Loading portfolio…</LoadingText>
      <template v-if="portfolio">
        <slot :portfolio="portfolio" />
        <PortfolioActions v-if="portfolio.isOwner" :kind="kind" :portfolio="portfolio" @deleted="selectedId = null" />
      </template>
    </template>
  </div>
</template>
