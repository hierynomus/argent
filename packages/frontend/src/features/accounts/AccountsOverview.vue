<script setup lang="ts">
import { computed, ref, watch } from "vue"
import { RouterLink, useRoute } from "vue-router"
import { hasRealIban, type Account } from "@argent/shared"
import { useAccounts } from "../../api"
import { Button, Card, EmptyState, Input, LoadingText, SegmentedControl } from "../../components/ui"
import { fmtBalance } from "../../lib/format"
import AddAccountForm from "./AddAccountForm.vue"
import { groupAccounts, holdersOf, totalsByCurrency, type AccountTypeFilter } from "./groupAccounts"

/** All accounts of the household in one place: grouped by holder, searchable, with totals; a row opens the account. */
const route = useRoute()
const { data, isLoading } = useAccounts()
const accounts = computed(() => data.value ?? [])

const TYPES = ["checking", "savings", "cash"] as const
const initialType = TYPES.find((t) => t === route.query.type) ?? "all"
const query = ref("")
const type = ref<AccountTypeFilter>(initialType)
const showHidden = ref(false)
const adding = ref(false)

const result = computed(() => groupAccounts(accounts.value, { query: query.value, type: type.value, showHidden: showHidden.value }))
const grandTotals = computed(() => totalsByCurrency(accounts.value.filter((a) => !a.hidden)))
const holders = computed(() => holdersOf(accounts.value))
const hiddenInTotal = computed(() => accounts.value.filter((a) => a.hidden).length)

// groups can be folded away; the choice is remembered (the storage may be unavailable)
const KEY = "argent.accounts.collapsed"
const read = (): string[] => {
  try { return JSON.parse(localStorage.getItem(KEY) ?? "[]") } catch { return [] }
}
const collapsed = ref(new Set<string>(read()))
watch(collapsed, (s) => {
  try { localStorage.setItem(KEY, JSON.stringify([...s])) } catch { /* not remembered */ }
}, { deep: true })
const groupKey = (holder: string | null) => holder ?? "\u0000"
const isOpen = (holder: string | null) => !collapsed.value.has(groupKey(holder))
function toggle(holder: string | null) {
  const next = new Set(collapsed.value)
  if (!next.delete(groupKey(holder))) next.add(groupKey(holder))
  collapsed.value = next
}

const TYPE_LABEL = { checking: "Checking", savings: "Savings", cash: "Cash" }
const TYPE_BADGE = {
  savings: "bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800",
  cash: "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800",
  checking: "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700",
}
const typeOf = (a: Account) => a.type ?? "checking"
const negative = (n: string | number) => Number(n) < 0
</script>

<template>
  <LoadingText v-if="isLoading" />
  <div v-else class="space-y-5">
    <div class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 class="text-2xl font-bold text-gray-900 dark:text-gray-100">Accounts</h1>
        <p v-if="accounts.length > 0" class="mt-1 text-sm text-gray-500 dark:text-gray-400">
          <span v-for="(t, i) in grandTotals" :key="t.currency">
            <template v-if="i > 0"> · </template>
            <span class="font-semibold tabular-nums" :class="negative(t.total) ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-gray-100'">{{ fmtBalance(String(t.total), t.currency) }}</span>
          </span>
          in {{ accounts.length - hiddenInTotal }} {{ accounts.length - hiddenInTotal === 1 ? "account" : "accounts" }}
        </p>
      </div>
      <Button v-if="!adding" variant="secondary" size="sm" @click="adding = true">+ Add account</Button>
    </div>

    <Card v-if="adding" size="xl" class="px-6 py-5"><AddAccountForm :holders="holders" @done="adding = false" /></Card>

    <div v-if="accounts.length > 0" class="flex flex-wrap items-center gap-3">
      <Input v-model="query" type="search" density="sm" placeholder="Search name, IBAN or holder…" aria-label="Search accounts" class="w-72" />
      <SegmentedControl v-model="type" :options="[{ value: 'all', label: 'All' }, { value: 'checking', label: 'Checking' }, { value: 'savings', label: 'Savings' }, { value: 'cash', label: 'Cash' }] as const" padding="px-3 py-1 font-medium" />
      <Button v-if="result.hiddenCount > 0 || showHidden" variant="muted-link" size="sm" :aria-pressed="showHidden" @click="showHidden = !showHidden">
        {{ showHidden ? "Hide hidden accounts" : `Show hidden (${result.hiddenCount})` }}
      </Button>
    </div>

    <EmptyState v-if="accounts.length === 0" title="No accounts yet." hint="Import a CAMT.053 file (Settings → Import), or add an account by hand for a bank without an export, or for cash." />
    <EmptyState v-else-if="result.groups.length === 0" title="No accounts match." hint="Change the search or the type filter." />

    <Card v-for="group in result.groups" :key="groupKey(group.holder)" size="xl" class="overflow-hidden">
      <button
        type="button"
        class="w-full flex items-center justify-between gap-4 px-5 py-3 bg-gray-50 dark:bg-gray-800/50 text-left"
        :aria-expanded="isOpen(group.holder)"
        :aria-label="`${group.holder ?? 'No holder'}, ${group.accounts.length} ${group.accounts.length === 1 ? 'account' : 'accounts'}`"
        @click="toggle(group.holder)"
      >
        <span class="flex items-center gap-2 min-w-0">
          <svg class="w-3.5 h-3.5 text-gray-400 transition-transform" :class="isOpen(group.holder) ? 'rotate-90' : ''" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><polyline points="9 18 15 12 9 6" /></svg>
          <span class="font-semibold text-gray-900 dark:text-gray-100 truncate">{{ group.holder ?? "No holder" }}</span>
          <span class="text-xs text-gray-400 dark:text-gray-500">{{ group.accounts.length }}</span>
        </span>
        <span class="flex gap-4 text-sm font-semibold tabular-nums">
          <span v-for="t in group.totals" :key="t.currency" :class="negative(t.total) ? 'text-red-600 dark:text-red-400' : 'text-gray-700 dark:text-gray-300'">{{ fmtBalance(String(t.total), t.currency) }}</span>
        </span>
      </button>

      <ul v-if="isOpen(group.holder)" class="divide-y divide-gray-100 dark:divide-gray-800">
        <li v-for="acc in group.accounts" :key="acc.id">
          <RouterLink :to="`/accounts/${acc.id}`" class="flex items-center gap-4 px-5 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors" :class="acc.hidden ? 'opacity-60' : ''">
            <div class="flex-1 min-w-0">
              <p class="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{{ acc.name ?? acc.iban }}</p>
              <p v-if="hasRealIban(acc)" class="font-mono text-xs text-gray-400 dark:text-gray-500 truncate">{{ acc.iban }}</p>
              <p v-else class="text-xs text-gray-400 dark:text-gray-500">Entered by hand</p>
            </div>
            <span v-if="acc.hidden" class="text-xs px-2 py-0.5 rounded-full border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400">Hidden</span>
            <span class="text-xs px-2 py-0.5 rounded-full font-medium border" :class="TYPE_BADGE[typeOf(acc)]">{{ TYPE_LABEL[typeOf(acc)] }}</span>
            <span class="w-32 text-right text-sm font-semibold tabular-nums" :class="negative(acc.balance) ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-gray-100'">{{ fmtBalance(acc.balance ?? "0", acc.currency) }}</span>
          </RouterLink>
        </li>
      </ul>
    </Card>
  </div>
</template>
