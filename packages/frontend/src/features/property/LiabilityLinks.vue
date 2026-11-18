<script setup lang="ts">
import { computed, ref } from "vue"
import { useMutation } from "@tanstack/vue-query"
import type { PropertyWithDetails } from "@argent/shared"
import { propertiesApi, useDebts, useInvalidate } from "../../api"
import { Button, Checkbox, ErrorText } from "../../components/ui"
import { fmtCur } from "../../lib/format"

/** Choose which mortgages and loans finance this property (only ones you can see are listed). */
const props = defineProps<{ property: PropertyWithDetails }>()
const emit = defineEmits<{ done: [] }>()
const invalidate = useInvalidate()

const { data: mortgageData } = useDebts("mortgages")
const { data: loanData } = useDebts("loans")
const mortgages = computed(() => mortgageData.value ?? [])
const loans = computed(() => loanData.value ?? [])

const chosenMortgages = ref(new Set(props.property.liabilities.filter((l) => l.kind === "mortgage").map((l) => l.id)))
const chosenLoans = ref(new Set(props.property.liabilities.filter((l) => l.kind === "loan").map((l) => l.id)))
const toggle = (set: Set<string>, id: string) => {
  const next = new Set(set)
  if (!next.delete(id)) next.add(id)
  return next
}

const save = useMutation({
  mutationFn: () => propertiesApi.setLinks(props.property.id, { mortgageIds: [...chosenMortgages.value], loanIds: [...chosenLoans.value] }),
  onSuccess: () => {
    invalidate.properties()
    emit("done")
  },
})
</script>

<template>
  <div class="pb-3 mb-3 border-b border-gray-100 dark:border-gray-800">
    <p class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Financed by</p>
    <p v-if="mortgages.length === 0 && loans.length === 0" class="text-sm text-gray-400 dark:text-gray-500">There are no mortgages or loans to link yet. Add one under Liabilities first.</p>
    <fieldset v-else class="space-y-1.5">
      <legend class="sr-only">Mortgages and loans financing {{ property.name }}</legend>
      <label v-for="m in mortgages" :key="`m-${m.id}`" class="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
        <Checkbox :checked="chosenMortgages.has(m.id)" @change="chosenMortgages = toggle(chosenMortgages, m.id)" />
        {{ m.name }} <span class="text-xs text-gray-400 dark:text-gray-500">mortgage · owed {{ fmtCur(m.totalCurrentBalance, m.currency) }}</span>
      </label>
      <label v-for="l in loans" :key="`l-${l.id}`" class="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
        <Checkbox :checked="chosenLoans.has(l.id)" @change="chosenLoans = toggle(chosenLoans, l.id)" />
        {{ l.name }} <span class="text-xs text-gray-400 dark:text-gray-500">loan · owed {{ fmtCur(l.totalCurrentBalance, l.currency) }}</span>
      </label>
    </fieldset>
    <div class="flex gap-2 mt-3">
      <Button size="sm" :disabled="save.isPending.value" @click="save.mutate()">Save links</Button>
      <Button variant="muted-link" size="sm" class="!px-2" @click="emit('done')">Cancel</Button>
    </div>
    <ErrorText :error="save.error.value" />
  </div>
</template>
