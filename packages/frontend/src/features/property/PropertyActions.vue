<script setup lang="ts">
import { ref } from "vue"
import { useMutation } from "@tanstack/vue-query"
import type { PropertyWithDetails } from "@argent/shared"
import { propertiesApi, useInvalidate } from "../../api"
import SharingPanel from "../../components/SharingPanel.vue"
import { Button, ConfirmButton } from "../../components/ui"

/** Owner-only footer of a property: share it with groups, or delete it. */
const props = defineProps<{ property: PropertyWithDetails }>()
const invalidate = useInvalidate()
const showAccess = ref(false)
const remove = useMutation({ mutationFn: () => propertiesApi.remove(props.property.id), onSuccess: () => invalidate.properties() })
</script>

<template>
  <div class="mt-4 pt-3 border-t border-gray-100 dark:border-gray-800">
    <div class="flex items-center justify-between">
      <Button variant="muted-link" @click="showAccess = !showAccess">{{ showAccess ? "Hide access" : "Share" }}</Button>
      <ConfirmButton label="Delete property" prompt="Delete property?" @confirm="remove.mutate()" />
    </div>
    <div v-if="showAccess" class="pt-3">
      <SharingPanel
        :members="property.members"
        :add-member="(m) => propertiesApi.addMember(property.id, m).then(() => invalidate.properties())"
        :remove-member="(group) => propertiesApi.removeMember(property.id, group).then(() => invalidate.properties())"
      />
    </div>
  </div>
</template>
