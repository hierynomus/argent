<script setup lang="ts">
import { onMounted } from "vue"
import { useRouter } from "vue-router"
import { useAuth } from "../auth"

/** Where the identity provider sends the browser back to: finish the sign-in, then go to the app. */
const auth = useAuth()
const router = useRouter()

onMounted(async () => {
  await auth.signinCallback()
  if (auth.isAuthenticated) router.replace("/")
})
</script>

<template>
  <div v-if="auth.error" class="flex h-screen items-center justify-center text-red-500">Authentication failed: {{ auth.error.message }}</div>
  <div v-else class="flex h-screen items-center justify-center text-gray-500">Completing sign in…</div>
</template>
