<script setup lang="ts">
import { ref } from "vue"
import { useMutation } from "@tanstack/vue-query"
import { unlockSchema } from "@argent/shared"
import { unlockApp, useInvalidate } from "../../api"
import { Button, ErrorText, Field, Input, vFocus } from "../../components/ui"
import { useFormErrors } from "../../lib/validate"

/** Shown instead of the app while the standalone app has a password and this window has not entered it. */
const invalidate = useInvalidate()
const { errors, check } = useFormErrors()
const password = ref("")

const unlock = useMutation({
  mutationFn: () => unlockApp(password.value),
  onSuccess: (status) => {
    password.value = ""
    invalidate.lockStatus(status)
  },
})
const submit = () => check(unlockSchema, { password: password.value }) && unlock.mutate()
</script>

<template>
  <div class="flex h-screen items-center justify-center bg-gray-50 dark:bg-gray-950 px-4">
    <form novalidate class="w-full max-w-sm rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 space-y-4 shadow-sm" @submit.prevent="submit">
      <div>
        <h1 class="text-xl font-bold text-gray-900 dark:text-gray-100">Argent is locked</h1>
        <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">Enter your password to open it.</p>
      </div>
      <Field label="Password" :error="errors.password">
        <Input v-model="password" v-focus type="password" autocomplete="current-password" class="w-full" />
      </Field>
      <ErrorText :error="unlock.error.value" />
      <Button type="submit" class="w-full" :disabled="unlock.isPending.value">Unlock</Button>
    </form>
  </div>
</template>
