<script setup lang="ts">
import { computed, ref } from "vue"
import { useRoute, useRouter } from "vue-router"
import { useMutation } from "@tanstack/vue-query"
import type { TransactionFilters, TransactionWithDetails } from "@argent/shared"
import { updateTransaction, useAccounts, useCategories, useInvalidate, useTransactions } from "../../api"
import Pagination from "../../components/Pagination.vue"
import { LoadingText } from "../../components/ui"
import AccountSelector from "./AccountSelector.vue"
import BulkActionBar from "./BulkActionBar.vue"
import TransactionDetail from "./TransactionDetail.vue"
import TransactionFiltersBar from "./TransactionFiltersBar.vue"
import TransactionsTable from "./TransactionsTable.vue"

const PAGE_SIZE = 50

/**
 * The transaction browser: filter by account / text / dates / label, page through, label in bulk, open details.
 * With `accountId` it is fixed to that account (no account picker); without it the account is chosen here,
 * starting from `?account=` in the address.
 */
const props = defineProps<{ accountId?: string }>()
const router = useRouter()
const route = useRoute()
const invalidate = useInvalidate()

const initialAccountId = props.accountId ?? (typeof route.query.account === "string" ? route.query.account : undefined)
const selectedAccounts = ref<Set<string>>(initialAccountId ? new Set([initialAccountId]) : new Set())
// a link from elsewhere can ask for a ready-made selection (the spending card: these labels, this month, money out)
const asked = (key: string) => (typeof route.query[key] === "string" && route.query[key] ? (route.query[key] as string) : undefined)
const preset = (): Partial<TransactionFilters> => {
  const categories = asked("categories")
  if (!categories) return {}
  return {
    categoryIds: categories.split(",").filter(Boolean),
    from: asked("from"),
    to: asked("to"),
    direction: asked("direction") === "DBIT" ? "DBIT" : asked("direction") === "CRDT" ? "CRDT" : undefined,
    excludeTransfers: asked("excludeTransfers") ? true : undefined,
    currency: asked("currency"),
  }
}
const presetLabel = ref<string | null>(asked("categories") ? asked("label") ?? "the selected labels" : null)
const filters = ref<TransactionFilters>({ page: 1, pageSize: PAGE_SIZE, ...preset() })
function clearPreset() {
  const { categoryIds: _c, direction: _d, excludeTransfers: _e, currency: _u, from: _f, to: _t, ...rest } = filters.value
  filters.value = { ...rest, page: 1 }
  presetLabel.value = null
  router.replace({ query: {} })
}
const openTx = ref<TransactionWithDetails | null>(null)
const selectedIds = ref<Set<string>>(new Set())

const { data: accountsData } = useAccounts()
const { data: labelsData } = useCategories()
const accounts = computed(() => accountsData.value ?? [])
const labels = computed(() => labelsData.value ?? [])
const query = computed(() => ({ ...filters.value, accountIds: props.accountId ? [props.accountId] : selectedAccounts.value.size > 0 ? [...selectedAccounts.value] : undefined }))
const { data, isLoading } = useTransactions(query)
const rows = computed(() => data.value?.data ?? [])

const relabel = useMutation({ mutationFn: ({ id, categoryId }: { id: string; categoryId: string | null }) => updateTransaction(id, { categoryId }) })

async function handleLabel(id: string, categoryId: string | null) {
  await relabel.mutateAsync({ id, categoryId })
  invalidate.transactions()
  if (openTx.value?.id === id) {
    const category = labels.value.find((l) => l.id === categoryId) ?? null
    openTx.value = { ...openTx.value, categoryId, category }
  }
}

function changeFilters(patch: Partial<TransactionFilters>) {
  // choosing a label by hand replaces the selection that came with the link
  if ("categoryId" in patch && presetLabel.value) {
    const { categoryIds: _c, ...rest } = filters.value
    filters.value = { ...rest, ...patch, page: 1 }
    presetLabel.value = null
    return
  }
  filters.value = { ...filters.value, ...patch, page: 1 }
}
function toggleRow(id: string) {
  const next = new Set(selectedIds.value)
  if (!next.delete(id)) next.add(id)
  selectedIds.value = next
}
const allOnPageSelected = computed(() => rows.value.length > 0 && rows.value.every((r) => selectedIds.value.has(r.id)))
const toggleAll = () => (selectedIds.value = allOnPageSelected.value ? new Set() : new Set(rows.value.map((r) => r.id)))
const goSubscriptions = () => router.push("/subscriptions")
</script>

<template>
  <div>
    <AccountSelector
      v-if="!accountId && accounts.length > 0"
      :accounts="accounts"
      :selected="selectedAccounts"
      @change="(ids) => { selectedAccounts = ids; filters = { ...filters, page: 1 } }"
    />

    <div v-if="presetLabel" class="mb-3 inline-flex flex-wrap items-center gap-x-2 gap-y-1 rounded-full bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-200 dark:border-indigo-900 pl-3 pr-1.5 py-1 text-sm text-indigo-800 dark:text-indigo-200" aria-label="Selection from the dashboard">
      <span>Showing <span class="font-medium">{{ presetLabel }}</span><template v-if="filters.direction === 'DBIT'"> · money out</template><template v-if="filters.from && filters.to"> · {{ filters.from }} to {{ filters.to }}</template></span>
      <button type="button" class="rounded-full px-2 py-0.5 text-xs font-medium hover:bg-indigo-100 dark:hover:bg-indigo-900" @click="clearPreset">Clear ✕</button>
    </div>

    <TransactionFiltersBar :labels="labels" @change="changeFilters" />

    <LoadingText v-if="isLoading" />
    <template v-else>
      <TransactionsTable :rows="rows" :open-id="openTx?.id ?? null" :selected-ids="selectedIds" @open="(tx) => (openTx = tx)" @toggle="toggleRow" @toggle-all="toggleAll" @open-subscriptions="goSubscriptions" />
      <Pagination :page="filters.page ?? 1" :page-size="PAGE_SIZE" :total="data?.total ?? 0" noun="transactions" @page="(page) => (filters = { ...filters, page })" />
    </template>

    <TransactionDetail
      v-if="openTx"
      :tx="openTx"
      :labels="labels"
      @close="openTx = null"
      @label="handleLabel"
      @transfer-change="(updated) => { invalidate.transactions(); openTx = updated }"
    />

    <BulkActionBar :rows="rows" :selected-ids="selectedIds" :labels="labels" @clear="selectedIds = new Set()" @subscription-created="goSubscriptions" />
  </div>
</template>
