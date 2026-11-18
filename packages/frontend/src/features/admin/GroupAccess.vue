<script setup lang="ts">
import { ref } from "vue"
import { useMutation } from "@tanstack/vue-query"
import type { AccountWithMembers } from "@argent/shared"
import { addMember, removeMember } from "../../api"
import { Button, ErrorText, Input, RoleBadge, Select, vFocus } from "../../components/ui"

/** The groups that may see (viewer) or edit (editor) an account, with revoke buttons and an "add group" row. */
const props = defineProps<{ account: AccountWithMembers }>()
const emit = defineEmits<{ changed: [] }>()

const adding = ref(false)
const groupName = ref("")
const role = ref<"viewer" | "editor">("viewer")

const add = useMutation({
  mutationFn: () => addMember(props.account.id, groupName.value.trim(), role.value),
  onSuccess: () => {
    adding.value = false
    groupName.value = ""
    role.value = "viewer"
    emit("changed")
  },
})
const remove = useMutation({ mutationFn: (group: string) => removeMember(props.account.id, group), onSuccess: () => emit("changed") })

function stopAdding() {
  adding.value = false
  groupName.value = ""
  add.reset()
}
const submit = () => groupName.value.trim() && add.mutate()
</script>

<template>
  <div class="divide-y divide-gray-50 dark:divide-gray-800">
    <div v-if="account.members.length === 0" class="px-5 py-3 text-sm text-gray-400 dark:text-gray-500 italic">No groups assigned</div>
    <div v-for="member in account.members" v-else :key="member.groupName" class="px-5 py-3 flex items-center justify-between gap-3">
      <div class="flex items-center gap-2 min-w-0">
        <span class="text-sm text-gray-700 dark:text-gray-300 font-medium truncate">{{ member.groupName }}</span>
        <RoleBadge :role="member.role" />
      </div>
      <Button variant="danger-link" size="xs" class="font-medium shrink-0" :disabled="remove.isPending.value" @click="remove.mutate(member.groupName)">Remove</Button>
    </div>
    <div v-if="remove.error.value" class="px-5 py-2"><ErrorText :error="remove.error.value" /></div>

    <div class="px-5 py-3">
      <div v-if="adding" class="flex flex-col gap-2">
        <div class="flex items-center gap-2">
          <Input v-model="groupName" v-focus type="text" placeholder="Authentik group name" aria-label="Group name" class="flex-1 rounded-md" @keydown.enter="submit" />
          <Select v-model="role" aria-label="Role" class="rounded-md">
            <option value="viewer">Viewer</option>
            <option value="editor">Editor</option>
          </Select>
          <Button class="rounded-md" :disabled="!groupName.trim() || add.isPending.value" @click="add.mutate()">{{ add.isPending.value ? "Adding…" : "Add" }}</Button>
          <Button variant="muted-link" size="sm" class="px-2" @click="stopAdding">Cancel</Button>
        </div>
        <ErrorText :error="add.error.value" />
      </div>
      <Button v-else variant="link" size="xs" @click="adding = true">+ Add group</Button>
    </div>
  </div>
</template>
