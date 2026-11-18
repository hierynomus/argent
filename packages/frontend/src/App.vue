<script setup lang="ts">
import { RouterView, useRoute } from "vue-router"
import { useAuth } from "./auth"
import Layout from "./components/Layout.vue"

const auth = useAuth()
const route = useRoute()
</script>

<template>
  <RouterView v-if="route.meta.public" />
  <div v-else-if="auth.isLoading" class="flex h-screen items-center justify-center text-gray-500">Loading…</div>
  <div v-else-if="auth.error" class="flex h-screen items-center justify-center text-red-500">Auth error: {{ auth.error.message }}</div>
  <Layout v-else-if="auth.isAuthenticated"><RouterView /></Layout>
</template>
