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
const filters = ref<TransactionFilters>({ page: 1, pageSize: PAGE_SIZE })
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

const changeFilters = (patch: Partial<TransactionFilters>) => (filters.value = { ...filters.value, ...patch, page: 1 })
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
