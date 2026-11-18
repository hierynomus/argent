<script setup lang="ts">
import { ref } from "vue"
import { useMutation } from "@tanstack/vue-query"
import type { AccountWithMembers } from "@argent/shared"
import { updateAccountOwner } from "../../api"
import { Button, ErrorText, Input, vFocus } from "../../components/ui"

/** Shows who owns an account and lets an admin reassign it (by Authentik user sub), or clear the owner. */
const props = defineProps<{ account: AccountWithMembers }>()
const emit = defineEmits<{ changed: [] }>()

const editing = ref(false)
const ownerSub = ref(props.account.ownerSub ?? "")

const save = useMutation({
  mutationFn: () => updateAccountOwner(props.account.id, ownerSub.value.trim() || null),
  onSuccess: () => {
    editing.value = false
    emit("changed")
  },
})
function cancel() {
  editing.value = false
  ownerSub.value = props.account.ownerSub ?? ""
  save.reset()
}
function edit() {
  ownerSub.value = props.account.ownerSub ?? ""
  editing.value = true
}
</script>

<template>
  <div v-if="!editing" class="flex items-center gap-2">
    <span class="text-xs text-gray-500 dark:text-gray-400">Owner:</span>
    <span v-if="account.ownerProfile" class="text-xs text-gray-700 dark:text-gray-300">{{ account.ownerProfile.email }}</span>
    <span v-else-if="account.ownerSub" class="text-xs font-mono text-gray-500 dark:text-gray-400">{{ account.ownerSub }}</span>
    <span v-else class="text-xs text-gray-400 dark:text-gray-500 italic">No owner</span>
    <Button variant="link" size="xs" class="font-normal" @click="edit">Edit</Button>
  </div>
  <div v-else class="flex flex-col gap-1.5">
    <div class="flex items-center gap-2">
      <Input v-model="ownerSub" v-focus density="sm" type="text" placeholder="User sub (Authentik UUID)" aria-label="Owner (user sub)" class="flex-1 rounded-md text-xs font-mono" @keydown.enter="save.mutate()" />
      <Button size="xs" class="rounded-md px-2.5 py-1" :disabled="save.isPending.value" @click="save.mutate()">{{ save.isPending.value ? "Saving…" : "Save" }}</Button>
      <Button variant="muted-link" size="xs" class="px-2 py-1" @click="cancel">Cancel</Button>
    </div>
    <ErrorText :error="save.error.value" />
  </div>
</template>
