<script setup lang="ts">
import { reactive, ref } from "vue"
import { useMutation } from "@tanstack/vue-query"
import { removePasswordSchema, setPasswordSchema } from "@argent/shared"
import { lockApp, removeAppPassword, setAppPassword, useInvalidate, useLockStatus } from "../../api"
import { Button, Card, ErrorText, Field, Input, LoadingText } from "../../components/ui"
import { useFormErrors } from "../../lib/validate"

/** Settings → Security (standalone app): the password that locks the app, so nobody opening it sees your numbers. */
const invalidate = useInvalidate()
const { data: status, isLoading } = useLockStatus()
const { errors, check } = useFormErrors()
const form = reactive({ current: "", password: "", confirm: "" })
const mode = ref<"change" | "remove">("change")
const done = ref("")

const reset = () => Object.assign(form, { current: "", password: "", confirm: "" })
const finish = (message: string) => (status: Parameters<typeof invalidate.lockStatus>[0]) => {
  invalidate.lockStatus(status)
  reset()
  done.value = message
}

const save = useMutation({
  mutationFn: () => setAppPassword(form.password, status.value?.passwordSet ? form.current : undefined),
  onSuccess: (s) => finish(status.value?.passwordSet ? "Password changed." : "Password set. Argent asks for it each time it starts.")(s),
})
const remove = useMutation({ mutationFn: () => removeAppPassword(form.current), onSuccess: finish("Password removed.") })
const lockNow = useMutation({
  mutationFn: lockApp,
  onSuccess: (s) => {
    invalidate.forgetAll()
    invalidate.lockStatus(s)
  },
})

function submit() {
  done.value = ""
  if (mode.value === "remove") return check(removePasswordSchema, { currentPassword: form.current }) && remove.mutate()
  const body = { password: form.password, currentPassword: form.current || undefined }
  if (!check(setPasswordSchema, body)) return
  if (form.password !== form.confirm) return void (errors.value.confirm = "The two passwords are not the same")
  save.mutate()
}
</script>

<template>
  <LoadingText v-if="isLoading" />
  <Card v-else class="px-5 py-5 space-y-4 max-w-xl">
    <div>
      <p class="text-sm font-medium text-gray-900 dark:text-gray-100">App password</p>
      <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">
        <template v-if="status?.passwordSet">Argent asks for the password every time it starts. Locking it hides everything until it is entered again.</template>
        <template v-else>No password is set: anyone who opens Argent on this computer sees everything. Set one to lock it.</template>
      </p>
      <p class="text-xs text-gray-400 dark:text-gray-500 mt-2">It locks the app, not the data files on disk: use disk encryption (FileVault, BitLocker, LUKS) to protect those. There is no way to recover a forgotten password except deleting <code>passwordHash</code> from config.json.</p>
    </div>

    <div v-if="status?.passwordSet" class="flex gap-2">
      <Button :variant="mode === 'change' ? 'primary' : 'secondary'" size="sm" @click="mode = 'change'; done = ''">Change password</Button>
      <Button :variant="mode === 'remove' ? 'primary' : 'secondary'" size="sm" @click="mode = 'remove'; done = ''">Remove password</Button>
      <Button variant="secondary" size="sm" class="ml-auto" :disabled="lockNow.isPending.value" @click="lockNow.mutate()">Lock now</Button>
    </div>

    <form novalidate class="space-y-3" @submit.prevent="submit">
      <Field v-if="status?.passwordSet" label="Current password" :error="errors.currentPassword"><Input v-model="form.current" type="password" autocomplete="current-password" class="w-full" /></Field>
      <template v-if="mode === 'change'">
        <Field :label="status?.passwordSet ? 'New password' : 'Password'" :error="errors.password"><Input v-model="form.password" type="password" autocomplete="new-password" class="w-full" /></Field>
        <Field label="Repeat the password" :error="errors.confirm"><Input v-model="form.confirm" type="password" autocomplete="new-password" class="w-full" /></Field>
      </template>
      <ErrorText :error="save.error.value ?? remove.error.value ?? lockNow.error.value" />
      <p v-if="done" class="text-sm text-green-600 dark:text-green-400">{{ done }}</p>
      <Button type="submit" size="sm" :disabled="save.isPending.value || remove.isPending.value">
        {{ mode === "remove" ? "Remove password" : status?.passwordSet ? "Change password" : "Set password" }}
      </Button>
    </form>
  </Card>
</template>
