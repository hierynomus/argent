<script setup lang="ts">
import { ref } from "vue"
import { useMutation } from "@tanstack/vue-query"
import type { PensionPlanWithDetails } from "@argent/shared"
import { pensionsApi, useInvalidate } from "../../api"
import SharingPanel from "../../components/SharingPanel.vue"
import { Button, ConfirmButton } from "../../components/ui"

/** Owner-only footer of a plan: share it with groups, or delete it. */
const props = defineProps<{ plan: PensionPlanWithDetails }>()
const invalidate = useInvalidate()
const showAccess = ref(false)
const remove = useMutation({ mutationFn: () => pensionsApi.remove(props.plan.id), onSuccess: () => invalidate.pensions() })
</script>

<template>
  <div class="mt-4 pt-3 border-t border-gray-100 dark:border-gray-800">
    <div class="flex items-center justify-between">
      <Button variant="muted-link" @click="showAccess = !showAccess">{{ showAccess ? "Hide access" : "Share" }}</Button>
      <ConfirmButton label="Delete plan" prompt="Delete plan and its statements?" @confirm="remove.mutate()" />
    </div>
    <div v-if="showAccess" class="pt-3">
      <SharingPanel
        :members="plan.members"
        :add-member="(m) => pensionsApi.addMember(plan.id, m).then(() => invalidate.pensions())"
        :remove-member="(group) => pensionsApi.removeMember(plan.id, group).then(() => invalidate.pensions())"
      />
    </div>
  </div>
</template>
