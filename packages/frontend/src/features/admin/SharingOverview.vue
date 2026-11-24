<script setup lang="ts">
import { computed } from "vue"
import type { AdminSharingResponse } from "@argent/shared"
import { Card, RoleBadge } from "../../components/ui"

/** Read-only view of every shared portfolio / mortgage / loan and the groups it is shared with. */
const props = defineProps<{ sharing: AdminSharingResponse }>()
const hasAny = computed(() => sections.value.length > 0)

const role = (r: string) => r as "viewer" | "editor"
interface SharedItem { id: string; name: string; type?: string; members: Array<{ groupName: string; role: string }> }
const sections = computed(() =>
  [
    { title: "Portfolios", items: props.sharing.portfolios as SharedItem[], withType: true },
    { title: "Mortgages", items: props.sharing.mortgages as SharedItem[], withType: false },
    { title: "Loans", items: props.sharing.loans as SharedItem[], withType: false },
    { title: "Property", items: (props.sharing.properties ?? []) as SharedItem[], withType: false },
    { title: "Stock options", items: (props.sharing.equity ?? []) as SharedItem[], withType: false },
    { title: "Pensions", items: (props.sharing.pensions ?? []) as SharedItem[], withType: false },
  ].filter((s) => s.items.length > 0),
)
const TH = "px-5 py-2 text-left"
</script>

<template>
  <Card v-if="!hasAny" class="px-5 py-10 text-center text-gray-400 dark:text-gray-500 text-sm">
    No resources are shared with groups yet.
  </Card>
  <div v-else class="space-y-6">
    <Card v-for="s in sections" :key="s.title" class="overflow-hidden">
      <div class="px-5 py-3 border-b border-gray-100 dark:border-gray-800"><p class="text-sm font-medium text-gray-900 dark:text-gray-100">{{ s.title }}</p></div>
      <table class="w-full text-sm">
        <thead>
          <tr class="text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wide border-b border-gray-100 dark:border-gray-800">
            <th :class="TH">Name</th>
            <th v-if="s.withType" :class="TH">Type</th>
            <th :class="TH">Group</th>
            <th :class="TH">Role</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-50 dark:divide-gray-800">
          <template v-for="item in s.items" :key="item.id">
            <tr v-for="(m, i) in item.members" :key="`${item.id}-${m.groupName}`" class="hover:bg-gray-50 dark:hover:bg-gray-800/50">
              <td class="px-5 py-2 text-gray-800 dark:text-gray-200">{{ i === 0 ? item.name : "" }}</td>
              <td v-if="s.withType" class="px-5 py-2 text-gray-500 dark:text-gray-400 capitalize">{{ i === 0 ? item.type : "" }}</td>
              <td class="px-5 py-2 font-mono text-gray-700 dark:text-gray-300">{{ m.groupName }}</td>
              <td class="px-5 py-2"><RoleBadge :role="role(m.role)" /></td>
            </tr>
          </template>
        </tbody>
      </table>
    </Card>
  </div>
</template>
