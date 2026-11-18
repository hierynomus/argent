<script setup lang="ts">
import { computed, reactive, ref } from "vue"
import { useMutation } from "@tanstack/vue-query"
import { createDebtSchema } from "@argent/shared"
import { debtApis, useDebts, useInvalidate, type DebtKind } from "../../api"
import { Button, Card, EmptyState, ErrorText, Field, FieldGroup, Input, LoadingText, SegmentedControl } from "../../components/ui"
import { useFormErrors } from "../../lib/validate"
import { DEBT_KINDS } from "./config"
import DebtCard from "./DebtCard.vue"

/** The Mortgages and Loans screens: a list of debts with a "new" form. Wording comes from `DEBT_KINDS`. */
const props = defineProps<{ kind: DebtKind }>()

const cfg = DEBT_KINDS[props.kind]
const invalidate = useInvalidate()
const { data, isLoading } = useDebts(props.kind)
const debts = computed(() => data.value ?? [])
const { errors, check } = useFormErrors()

const showCreate = ref(false)
const form = reactive<{ name: string; currency: "EUR" | "USD" }>({ name: "", currency: "EUR" })

const create = useMutation({
  mutationFn: () => debtApis[props.kind].create({ name: form.name, currency: form.currency }),
  onSuccess: () => {
    invalidate.debts(props.kind)
    Object.assign(form, { name: "", currency: "EUR" })
    showCreate.value = false
  },
})
</script>

<template>
  <LoadingText v-if="isLoading" />
  <div v-else class="space-y-6">
    <div class="flex items-center justify-between">
      <h1 class="text-2xl font-bold text-gray-900 dark:text-gray-100">{{ cfg.title }}</h1>
      <Button v-if="!showCreate" size="md" class="rounded-lg" @click="showCreate = true">+ New {{ cfg.noun }}</Button>
    </div>

    <Card size="xl" v-if="showCreate" class="px-6 py-5">
      <p class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-4">New {{ cfg.noun }}</p>
      <div class="flex gap-3 flex-wrap items-end">
        <Field label="Name" :error="errors.name">
          <Input v-model="form.name" density="lg" type="text" :placeholder="cfg.createPlaceholder" class="w-56" />
        </Field>
        <FieldGroup label="Currency"><SegmentedControl v-model="form.currency" :options="['EUR', 'USD'] as const" padding="px-3 py-1.5" /></FieldGroup>
        <Button :disabled="!form.name || create.isPending.value" @click="check(createDebtSchema, { name: form.name, currency: form.currency }) && create.mutate()">
          {{ create.isPending.value ? "Creating…" : "Create" }}
        </Button>
        <Button variant="secondary" @click="showCreate = false">Cancel</Button>
      </div>
      <ErrorText :error="create.error.value" />
    </Card>

    <EmptyState v-if="debts.length === 0 && !showCreate" :title="`No ${cfg.noun}s yet.`" :hint="cfg.emptyHint" />
    <div v-else class="space-y-6">
      <DebtCard v-for="d in debts" :key="d.id" :kind="kind" :debt="d" />
    </div>
  </div>
</template>
