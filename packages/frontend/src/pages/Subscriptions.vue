<script setup lang="ts">
import { computed, ref } from "vue"
import { useMutation } from "@tanstack/vue-query"
import { runSubscriptionDetection, useAccounts, useInvalidate, useSubscriptions } from "../api"
import { Button, Card, EmptyState, LoadingText } from "../components/ui"
import AddSubscriptionForm from "../features/subscriptions/AddSubscriptionForm.vue"
import CandidateCard from "../features/subscriptions/CandidateCard.vue"
import SubscriptionRow from "../features/subscriptions/SubscriptionRow.vue"

/** Recurring payments: the ones you track ("My Subscriptions") and the ones the detector suggests ("Discovered"). */
const invalidate = useInvalidate()
const tab = ref<"confirmed" | "candidates">("confirmed")
const showAddForm = ref(false)
const detectNote = ref<string | null>(null)

const { data: subsData, isLoading } = useSubscriptions()
const { data: accountsData } = useAccounts()
const accounts = computed(() => accountsData.value ?? [])
const candidates = computed(() => (subsData.value ?? []).filter((s) => s.status === "candidate"))
const confirmed = computed(() => (subsData.value ?? []).filter((s) => s.status === "confirmed"))

const detect = useMutation({
  mutationFn: runSubscriptionDetection,
  onSuccess: ({ detected }) => {
    if (detected > 0) {
      invalidate.subscriptions()
      tab.value = "candidates"
      detectNote.value = null
    } else {
      detectNote.value = "No new recurring patterns found."
    }
  },
})

const TAB = "px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5"
const ON = "border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400"
const OFF = "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
</script>

<template>
  <div>
    <div class="flex items-center justify-between mb-4">
      <h1 class="text-2xl font-bold text-gray-900 dark:text-gray-100">Subscriptions</h1>
      <div class="flex items-center gap-2">
        <Button v-if="tab === 'confirmed'" variant="secondary" class="rounded-md" @click="showAddForm = !showAddForm">+ Add</Button>
        <Button v-if="tab === 'candidates'" class="rounded-md" :disabled="detect.isPending.value" @click="detect.mutate()">{{ detect.isPending.value ? "Detecting…" : "Run Detection" }}</Button>
      </div>
    </div>

    <div class="border-b border-gray-200 dark:border-gray-700 mb-6">
      <nav class="flex -mb-px" aria-label="Subscription views">
        <button type="button" :class="[TAB, tab === 'confirmed' ? ON : OFF]" @click="tab = 'confirmed'">My Subscriptions</button>
        <button type="button" :class="[TAB, tab === 'candidates' ? ON : OFF]" @click="tab = 'candidates'">
          Discovered
          <span v-if="candidates.length > 0" class="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-amber-500 text-white text-[10px] font-bold leading-none">{{ candidates.length }}</span>
        </button>
      </nav>
    </div>

    <LoadingText v-if="isLoading" />
    <div v-else-if="tab === 'confirmed'" class="flex flex-col gap-4">
      <AddSubscriptionForm v-if="showAddForm && accounts.length > 0" :accounts="accounts" @done="showAddForm = false" />
      <Card v-if="confirmed.length === 0" class="px-5 py-12 text-center">
        <p class="text-gray-500 dark:text-gray-400 text-sm mb-3">No confirmed subscriptions yet.</p>
        <Button v-if="candidates.length > 0" variant="link" class="font-normal" @click="tab = 'candidates'">
          {{ candidates.length }} suggestion{{ candidates.length !== 1 ? "s" : "" }} waiting in Discovered →
        </Button>
        <p v-else class="text-gray-400 dark:text-gray-500 text-xs">Import transactions and use the Discovered tab to find recurring patterns, or add one manually.</p>
      </Card>
      <div v-else class="flex flex-col gap-3"><SubscriptionRow v-for="sub in confirmed" :key="sub.id" :sub="sub" /></div>
    </div>
    <div v-else class="flex flex-col gap-3">
      <p v-if="detectNote" role="status" class="text-sm text-gray-500 dark:text-gray-400">{{ detectNote }}</p>
      <EmptyState v-if="candidates.length === 0" title='No suggestions found. Click "Run Detection" to search for recurring payments.' />
      <CandidateCard v-for="sub in candidates" v-else :key="sub.id" :sub="sub" />
    </div>
  </div>
</template>
