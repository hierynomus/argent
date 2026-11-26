<script setup lang="ts">
import { computed } from "vue"
import type { Account } from "@argent/shared"
import { groupAccounts } from "../accounts/groupAccounts"

/**
 * "All accounts" plus one toggle chip per account. When accounts have holders they are shown per holder, and
 * the holder's name selects (or clears) all of that holder's accounts at once. Hidden accounts are left out
 * unless they are selected. Never mutates the selection it is given.
 */
const props = defineProps<{ accounts: Account[]; selected: Set<string> }>()
const emit = defineEmits<{ change: [ids: Set<string>] }>()

const allSelected = computed(() => props.selected.size === 0)
const grouped = computed(() => props.accounts.some((a) => a.holder))
const shown = computed(() => props.accounts.filter((a) => !a.hidden || props.selected.has(a.id)))
const groups = computed(() => groupAccounts(shown.value, { showHidden: true }).groups)
const CHIP = "px-3 py-1 rounded-full text-sm font-medium border transition-colors"
const ON = "bg-indigo-600 text-white border-indigo-600"
const OFF = "bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500"

function toggle(id: string) {
  const next = new Set(props.selected)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  emit("change", next)
}
function toggleGroup(ids: string[]) {
  const next = new Set(props.selected)
  const all = ids.every((id) => next.has(id))
  for (const id of ids) all ? next.delete(id) : next.add(id)
  emit("change", next)
}
</script>

<template>
  <div class="mb-4 space-y-2">
    <div class="flex flex-wrap gap-2">
      <button type="button" :aria-pressed="allSelected" :class="[CHIP, allSelected ? ON : OFF]" @click="emit('change', new Set())">All accounts</button>
      <template v-if="!grouped">
        <button v-for="acc in shown" :key="acc.id" type="button" :aria-pressed="selected.has(acc.id)" :class="[CHIP, selected.has(acc.id) ? ON : OFF]" @click="toggle(acc.id)">
          {{ acc.name ?? acc.iban }}
        </button>
      </template>
    </div>
    <div v-if="grouped" v-for="g in groups" :key="g.holder ?? '-'" class="flex flex-wrap items-center gap-2">
      <button
        type="button"
        class="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 w-24 text-left truncate"
        :title="`Select all of ${g.holder ?? 'the accounts without a holder'}`"
        :aria-label="`All of ${g.holder ?? 'no holder'}`"
        @click="toggleGroup(g.accounts.map((a) => a.id))"
      >{{ g.holder ?? "No holder" }}</button>
      <button v-for="acc in g.accounts" :key="acc.id" type="button" :aria-pressed="selected.has(acc.id)" :class="[CHIP, selected.has(acc.id) ? ON : OFF]" @click="toggle(acc.id)">
        {{ acc.name ?? acc.iban }}
      </button>
    </div>
  </div>
</template>
