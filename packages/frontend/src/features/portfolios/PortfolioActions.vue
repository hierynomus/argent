<script setup lang="ts">
import { ref } from "vue"
import { useMutation } from "@tanstack/vue-query"
import { portfolioApis, useInvalidate, type PortfolioKind } from "../../api"
import SharingPanel, { type SharingMember } from "../../components/SharingPanel.vue"
import { Button, Card, ConfirmButton } from "../../components/ui"

/** Owner-only footer of a portfolio: share it with groups, or delete it. */
const props = defineProps<{ kind: PortfolioKind; portfolio: { id: string; members: SharingMember[] } }>()
const emit = defineEmits<{ deleted: [] }>()

const invalidate = useInvalidate()
const showAccess = ref(false)
const refresh = () => invalidate.portfolios(props.kind)

const remove = useMutation({
  mutationFn: () => portfolioApis[props.kind].remove(props.portfolio.id),
  onSuccess: () => {
    refresh()
    emit("deleted")
  },
})
</script>

<template>
  <Card class="mt-4 overflow-hidden">
    <div class="px-4 py-3 flex items-center justify-between border-b border-gray-100 dark:border-gray-800">
      <Button variant="muted-link" @click="showAccess = !showAccess">{{ showAccess ? "Hide access" : "Share" }}</Button>
      <div class="flex items-center gap-3">
        <ConfirmButton label="Delete portfolio" prompt="Delete portfolio?" @confirm="remove.mutate()" />
      </div>
    </div>

    <div v-if="showAccess" class="px-4 py-4">
      <SharingPanel
        :members="portfolio.members"
        :add-member="(m) => portfolioApis[kind].addMember(portfolio.id, m).then(refresh)"
        :remove-member="(group) => portfolioApis[kind].removeMember(portfolio.id, group).then(refresh)"
      />
    </div>
  </Card>
</template>
