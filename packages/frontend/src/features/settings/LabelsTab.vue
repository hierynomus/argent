<script setup lang="ts">
import { ref } from "vue"
import { useMutation } from "@tanstack/vue-query"
import { createCategorySchema } from "@argent/shared"
import { createCategory, deleteCategory, useCategories, useInvalidate } from "../../api"
import { Button, Card, ErrorText, Input, LoadingText } from "../../components/ui"
import { useFormErrors } from "../../lib/validate"

/** Settings → Labels: the categories transactions can be tagged with (a name and a colour each). */
const invalidate = useInvalidate()
const { data: labels, isLoading } = useCategories()
const { errors, check } = useFormErrors()
const name = ref("")
const color = ref("#6366f1")

const create = useMutation({
  mutationFn: () => createCategory({ name: name.value.trim(), color: color.value }),
  onSuccess: () => {
    invalidate.categories()
    name.value = ""
  },
})
const remove = useMutation({ mutationFn: (id: string) => deleteCategory(id), onSuccess: () => invalidate.categories() })
const submit = () => check(createCategorySchema, { name: name.value, color: color.value }) && create.mutate()
</script>

<template>
  <div class="max-w-xl">
    <Card class="p-4 mb-4">
      <h2 class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Add label</h2>
      <div class="flex gap-3">
        <Input v-model="name" density="lg" type="text" placeholder="Label name" aria-label="Label name" :aria-invalid="errors.name ? true : undefined" class="flex-1 rounded-md" />
        <input v-model="color" type="color" aria-label="Label colour" class="w-10 h-9 rounded-sm border border-gray-300 dark:border-gray-600 cursor-pointer bg-white dark:bg-gray-800" title="Pick color" />
        <Button size="md" class="rounded-md py-1.5!" :disabled="!name.trim() || create.isPending.value" @click="submit">Add</Button>
      </div>
      <p v-if="errors.name" role="alert" class="text-xs text-red-600 dark:text-red-400 mt-2">{{ errors.name }}</p>
      <ErrorText :error="create.error.value" />
    </Card>

    <LoadingText v-if="isLoading" />
    <Card v-else class="divide-y divide-gray-100 dark:divide-gray-800">
      <p v-if="labels?.length === 0" class="px-4 py-6 text-gray-400 dark:text-gray-500 text-sm text-center">No labels yet.</p>
      <div v-for="label in labels" :key="label.id" class="flex items-center px-4 py-3">
        <span class="w-3 h-3 rounded-full mr-3 shrink-0" :style="{ backgroundColor: label.color ?? '#9ca3af' }" />
        <span class="flex-1 text-sm text-gray-900 dark:text-gray-100">{{ label.name }}</span>
        <button type="button" :aria-label="`Delete label ${label.name}`" class="text-xs text-gray-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400" @click="remove.mutate(label.id)">Delete</button>
      </div>
      <ErrorText :error="remove.error.value" />
    </Card>
  </div>
</template>
