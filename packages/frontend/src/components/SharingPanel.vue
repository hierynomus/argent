<script setup lang="ts">
import { ref } from "vue"
import { useMutation } from "@tanstack/vue-query"
import { Button, ErrorText, Field, FieldGroup, Input, RoleBadge, SegmentedControl } from "./ui"

export interface SharingMember {
  groupName: string
  role: "viewer" | "editor"
}

/**
 * "Shared access": which groups can see (viewer) or edit (editor) a resource, with a form to add a
 * group and a button to revoke one. Used for portfolios, mortgages and loans.
 *
 * The panel owns its form state and shows server errors; the caller only says how to add and remove
 * (and refreshes its own data when those finish).
 */
const props = defineProps<{
  members: SharingMember[]
  addMember: (member: SharingMember) => Promise<unknown>
  removeMember: (groupName: string) => Promise<unknown>
}>()

const groupName = ref("")
const role = ref<"viewer" | "editor">("viewer")

const add = useMutation({
  mutationFn: () => props.addMember({ groupName: groupName.value.trim(), role: role.value }),
  onSuccess: () => {
    groupName.value = ""
  },
})
const remove = useMutation({ mutationFn: (group: string) => props.removeMember(group) })
</script>

<template>
  <div>
    <p class="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-3">Shared access</p>

    <p v-if="members.length === 0" class="text-xs text-gray-400 dark:text-gray-500 mb-3">Not shared with anyone.</p>
    <div v-else class="flex flex-col gap-1.5 mb-3">
      <div v-for="m in members" :key="m.groupName" class="flex items-center gap-3">
        <span class="text-sm text-gray-700 dark:text-gray-300 font-mono">{{ m.groupName }}</span>
        <RoleBadge :role="m.role" />
        <Button variant="danger-link" size="xs" :disabled="remove.isPending.value" @click="remove.mutate(m.groupName)">Remove</Button>
      </div>
    </div>

    <div class="flex gap-2 flex-wrap items-end">
      <Field label="Group name">
        <Input v-model="groupName" density="sm" type="text" placeholder="e.g. family" class="w-44" />
      </Field>
      <FieldGroup label="Role">
        <SegmentedControl v-model="role" :options="['viewer', 'editor'] as const" capitalize />
      </FieldGroup>
      <Button :disabled="!groupName.trim() || add.isPending.value" @click="add.mutate()">+ Add</Button>
    </div>
    <ErrorText :error="add.error.value ?? remove.error.value" />
  </div>
</template>
