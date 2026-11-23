<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from "vue"
import { RouterView, useRoute } from "vue-router"
import { useQueryClient } from "@tanstack/vue-query"
import { LOCKED_EVENT, queryKeys, useLockStatus } from "./api"
import { isLocalMode, useAuth } from "./auth"
import Layout from "./components/Layout.vue"
import UnlockScreen from "./features/lock/UnlockScreen.vue"

const auth = useAuth()
const route = useRoute()

// the standalone app can have a password: until it is entered nothing of the app (or its data) is shown
const local = isLocalMode()
const qc = useQueryClient()
const { data: lock, isLoading: lockLoading, error: lockError } = useLockStatus({ enabled: local })
const locked = computed(() => local && !!lock.value?.passwordSet && !lock.value.unlocked)
// the server locked itself under us (it restarted): go back to the unlock screen
const onLocked = () => {
  qc.clear()
  qc.setQueryData(queryKeys.lockStatus, { passwordSet: true, unlocked: false })
}
onMounted(() => window.addEventListener(LOCKED_EVENT, onLocked))
onBeforeUnmount(() => window.removeEventListener(LOCKED_EVENT, onLocked))
</script>

<template>
  <div v-if="local && lockLoading" class="flex h-screen items-center justify-center text-gray-500">Loading…</div>
  <div v-else-if="local && lockError" class="flex h-screen items-center justify-center text-red-500">Cannot reach Argent: {{ lockError.message }}</div>
  <UnlockScreen v-else-if="locked" />
  <RouterView v-else-if="route.meta.public" />
  <div v-else-if="auth.isLoading" class="flex h-screen items-center justify-center text-gray-500">Loading…</div>
  <div v-else-if="auth.error" class="flex h-screen items-center justify-center text-red-500">Auth error: {{ auth.error.message }}</div>
  <Layout v-else-if="auth.isAuthenticated"><RouterView /></Layout>
</template>
