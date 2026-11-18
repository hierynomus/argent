<script setup lang="ts">
import { reactive } from "vue"
import { useMutation } from "@tanstack/vue-query"
import { createMetalLotSchema, type MetalPortfolioDetail } from "@argent/shared"
import { metalsApi, useInvalidate } from "../../../api"
import { Field, FieldGroup, Input, SegmentedControl, Select } from "../../../components/ui"
import { capitalize } from "../../../lib/format"
import { useFormErrors } from "../../../lib/validate"
import FormActions from "../FormActions.vue"
import FormCard from "../FormCard.vue"

/** Records a purchase lot: N identical pieces of one metal bought together at one price. */
const props = defineProps<{ portfolio: MetalPortfolioDetail }>()
const emit = defineEmits<{ done: [] }>()

const METALS = ["gold", "silver", "platinum", "palladium"] as const
const FORMS = ["coin", "bar", "other"] as const

const invalidate = useInvalidate()
const { errors, check } = useFormErrors()
const form = reactive({
  purchaseDate: "",
  metal: "gold" as string,
  itemName: "",
  itemForm: "coin" as string,
  unit: "g" as "g" | "oz",
  weightPerPiece: "",
  quantity: "1",
  pricePerPiece: "",
  notes: "",
})

const body = () => ({
  purchaseDate: form.purchaseDate,
  metal: form.metal,
  itemName: form.itemName.trim() || undefined,
  itemForm: form.itemForm || undefined,
  unit: form.unit,
  weightPerPiece: form.weightPerPiece,
  quantity: parseInt(form.quantity, 10) || 1,
  pricePerPiece: form.pricePerPiece,
  notes: form.notes.trim() || undefined,
})

const save = useMutation({
  mutationFn: () => metalsApi.addLot(props.portfolio.id, body()),
  onSuccess: () => {
    invalidate.portfolios("metals")
    emit("done")
  },
})

function submit() {
  if (check(createMetalLotSchema, body())) save.mutate()
}
</script>

<template>
  <FormCard @submit="submit">
    <h3 class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Add purchase lot</h3>
    <div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
      <Field label="Metal">
        <Select v-model="form.metal" required class="w-full"><option v-for="m in METALS" :key="m" :value="m">{{ capitalize(m) }}</option></Select>
      </Field>
      <Field label="Item name"><Input v-model="form.itemName" placeholder="1oz Krugerrand" class="w-full" /></Field>
      <Field label="Form">
        <Select v-model="form.itemForm" class="w-full"><option v-for="f in FORMS" :key="f" :value="f">{{ capitalize(f) }}</option></Select>
      </Field>
      <FieldGroup label="Unit"><SegmentedControl v-model="form.unit" :options="['g', 'oz'] as const" padding="flex-1 py-1.5 font-medium" /></FieldGroup>
      <Field :label="`Weight / piece (${form.unit})`" :error="errors.weightPerPiece">
        <Input v-model="form.weightPerPiece" required type="number" step="any" min="0" :placeholder="form.unit === 'oz' ? '1' : '31.1'" class="w-full" />
      </Field>
      <Field label="Quantity" :error="errors.quantity"><Input v-model="form.quantity" required type="number" min="1" step="1" class="w-full" /></Field>
      <Field :label="`Price / piece (${portfolio.currency})`" :error="errors.pricePerPiece">
        <Input v-model="form.pricePerPiece" required type="number" step="any" min="0" placeholder="2000" class="w-full" />
      </Field>
      <Field label="Purchase date" :error="errors.purchaseDate"><Input v-model="form.purchaseDate" required type="date" class="w-full" /></Field>
      <Field label="Notes"><Input v-model="form.notes" placeholder="Optional" class="w-full" /></Field>
    </div>
    <FormActions submit-label="Add lot" :pending="save.isPending.value" :error="save.error.value" @cancel="emit('done')" />
  </FormCard>
</template>
