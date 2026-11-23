<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch, watchEffect } from "vue"
import { useRouter } from "vue-router"
import { isLocalMode, useAuth } from "../auth"
import { useLockStatus, useMe } from "../api"
import { useLockApp } from "../features/lock/useLock"
import Logo from "./Logo.vue"
import NavItem from "./NavItem.vue"

/** App shell: header with the user menu, collapsible sidebar, and the page in the content area (default slot). */
const auth = useAuth()
const router = useRouter()
const { data: me } = useMe()

const read = (): string | null => {
  try { return localStorage.getItem("sidebar") } catch { return null }
}
// sidebar expanded/collapsed, remembered across visits
const expanded = ref(read() !== "collapsed")
// displayLabels trails `expanded`: false at once on collapse, but waits for the width animation (200ms)
// before turning true on expand — which prevents the left-to-right text wipe.
const displayLabels = ref(expanded.value)
let timer: ReturnType<typeof setTimeout> | undefined
watch(expanded, (open) => {
  clearTimeout(timer)
  if (!open) displayLabels.value = false
  else timer = setTimeout(() => (displayLabels.value = true), 200)
})
function toggleSidebar() {
  expanded.value = !expanded.value
  try { localStorage.setItem("sidebar", expanded.value ? "expanded" : "collapsed") } catch { /* private mode: just don't remember */ }
}

// theme: the profile's choice, with "system" following the OS
const query = window.matchMedia("(prefers-color-scheme: dark)")
const prefersDark = ref(query.matches)
const onSchemeChange = (e: MediaQueryListEvent) => (prefersDark.value = e.matches)
watchEffect(() => {
  const theme = me.value?.theme ?? "system"
  document.documentElement.classList.toggle("dark", theme === "dark" || (theme === "system" && prefersDark.value))
})

const menuOpen = ref(false)
const menu = ref<HTMLElement | null>(null)
const closeOnOutsideClick = (e: MouseEvent) => {
  if (menu.value && !menu.value.contains(e.target as Node)) menuOpen.value = false
}
onMounted(() => {
  query.addEventListener("change", onSchemeChange)
  document.addEventListener("mousedown", closeOnOutsideClick)
})
onBeforeUnmount(() => {
  clearTimeout(timer)
  query.removeEventListener("change", onSchemeChange)
  document.removeEventListener("mousedown", closeOnOutsideClick)
})

const displayName = () => me.value?.name || me.value?.email || auth.user?.profile.email || "Account"
const local = isLocalMode()
const { data: lock } = useLockStatus({ enabled: local })
const locking = useLockApp()
function lockNow() {
  menuOpen.value = false
  locking.mutate()
}
function goProfile() {
  menuOpen.value = false
  router.push("/profile")
}
const SECTION = "pt-5 pb-1"
</script>

<template>
  <div class="min-h-screen bg-gray-50 dark:bg-gray-950 flex flex-col">
    <header class="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-4 py-3 flex items-center justify-between shrink-0 z-20">
      <div class="flex items-center gap-3">
        <button
          type="button"
          class="p-1.5 rounded-md text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          :title="expanded ? 'Collapse sidebar' : 'Expand sidebar'"
          :aria-label="expanded ? 'Collapse sidebar' : 'Expand sidebar'"
          @click="toggleSidebar"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <polyline :points="expanded ? '15 18 9 12 15 6' : '9 18 15 12 9 6'" />
          </svg>
        </button>
        <Logo />
        <span class="font-semibold text-lg text-gray-900 dark:text-gray-100">Argent</span>
      </div>

      <div ref="menu" class="relative">
        <button
          type="button"
          class="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 px-2 py-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          @click="menuOpen = !menuOpen"
        >
          <span class="inline-flex items-center justify-center w-7 h-7 rounded-full bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300 text-xs font-semibold select-none">{{ displayName().charAt(0).toUpperCase() }}</span>
          <span>{{ displayName() }}</span>
          <svg class="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" /></svg>
        </button>

        <div v-if="menuOpen" class="absolute right-0 mt-1 w-44 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-1 z-50">
          <button type="button" class="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800" @click="goProfile">Profile</button>
          <div class="border-t border-gray-100 dark:border-gray-800 my-1" />
          <!-- the standalone app has no account to sign out of: it locks, when it has a password -->
          <button v-if="local" type="button" :disabled="!lock?.passwordSet" class="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:text-gray-400 disabled:hover:bg-transparent dark:disabled:text-gray-600" :title="lock?.passwordSet ? undefined : 'Set a password in Profile first'" @click="lockNow">Lock</button>
          <button v-else type="button" class="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800" @click="auth.signoutRedirect()">Sign out</button>
        </div>
      </div>
    </header>

    <div class="flex flex-1 min-h-0">
      <aside
        :style="{ width: expanded ? '220px' : '64px' }"
        class="shrink-0 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 flex flex-col transition-[width] duration-200 overflow-hidden z-10"
      >
        <nav aria-label="Main" class="flex-1 p-2 flex flex-col gap-0.5 overflow-y-auto overflow-x-hidden">
          <div class="pt-3" />
          <NavItem to="/dashboard" icon="home" label="Dashboard" :show-label="displayLabels" />

          <!-- Section headers keep the same height in both modes so the items below don't shift. -->
          <template v-for="section in [
            { label: 'Banking', items: [['/checking', 'credit-card', 'Checking'], ['/savings', 'piggy-bank', 'Savings'], ['/cash', 'wallet', 'Cash'], ['/overview', 'list', 'Transactions'], ['/subscriptions', 'repeat', 'Subscriptions']] },
            { label: 'Liabilities', items: [['/mortgages', 'building', 'Mortgages'], ['/loans', 'banknote', 'Loans']] },
            { label: 'Investments', items: [['/crypto', 'coin', 'Crypto'], ['/metals', 'gem', 'Metals'], ['/stocks', 'trending-up', 'Stocks'], ['/property', 'house', 'Property'], ['/equity', 'layers', 'Options']] },
          ]" :key="section.label">
            <div :class="SECTION">
              <p v-if="displayLabels" class="px-3 text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 truncate">{{ section.label }}</p>
              <div v-else class="h-4 flex items-center"><div class="w-full border-t border-gray-100 dark:border-gray-800 mx-1" /></div>
            </div>
            <NavItem v-for="[to, icon, label] in section.items" :key="to" :to="to" :icon="icon as any" :label="label" :show-label="displayLabels" />
          </template>

          <div class="flex-1" />
          <div class="border-t border-gray-100 dark:border-gray-800 my-2" />
          <NavItem to="/settings" icon="settings" label="Settings" :show-label="displayLabels" />
        </nav>
      </aside>

      <main class="flex-1 overflow-auto p-6">
        <div class="max-w-7xl mx-auto"><slot /></div>
      </main>
    </div>
  </div>
</template>
