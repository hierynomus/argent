import { useState } from "react"
import { useMutation } from "@tanstack/react-query"
import { createCategorySchema } from "@argent/shared"
import { createCategory, deleteCategory, useCategories, useInvalidate } from "../../api"
import { Button, ErrorText, Input, LoadingText } from "../../components/ui"
import { useFormErrors } from "../../lib/validate"

/** Settings → Labels: the categories transactions can be tagged with (a name and a colour each). */
export function LabelsTab() {
  const invalidate = useInvalidate()
  const { data: labels, isLoading } = useCategories()
  const { errors, check } = useFormErrors()
  const [name, setName] = useState("")
  const [color, setColor] = useState("#6366f1")

  const create = useMutation({
    mutationFn: () => createCategory({ name: name.trim(), color }),
    onSuccess: () => {
      invalidate.categories()
      setName("")
    },
  })
  const remove = useMutation({ mutationFn: (id: string) => deleteCategory(id), onSuccess: () => invalidate.categories() })

  return (
    <div className="max-w-xl">
      <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-4 mb-4">
        <h2 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Add label</h2>
        <div className="flex gap-3">
          <Input density="lg" type="text" placeholder="Label name" aria-label="Label name" aria-invalid={errors.name ? true : undefined} value={name} onChange={(e) => setName(e.target.value)} className="flex-1 rounded-md" />
          <input
            type="color"
            aria-label="Label colour"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="w-10 h-9 rounded border border-gray-300 dark:border-gray-600 cursor-pointer bg-white dark:bg-gray-800"
            title="Pick color"
          />
          <Button size="md" className="rounded-md !py-1.5" disabled={!name.trim() || create.isPending} onClick={() => check(createCategorySchema, { name, color }) && create.mutate()}>
            Add
          </Button>
        </div>
        {errors.name && <p role="alert" className="text-xs text-red-600 dark:text-red-400 mt-2">{errors.name}</p>}
        <ErrorText error={create.error} />
      </div>

      {isLoading ? (
        <LoadingText />
      ) : (
        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-800">
          {labels?.length === 0 && <p className="px-4 py-6 text-gray-400 dark:text-gray-500 text-sm text-center">No labels yet.</p>}
          {labels?.map((label) => (
            <div key={label.id} className="flex items-center px-4 py-3">
              <span className="w-3 h-3 rounded-full mr-3 flex-shrink-0" style={{ backgroundColor: label.color ?? "#9ca3af" }} />
              <span className="flex-1 text-sm text-gray-900 dark:text-gray-100">{label.name}</span>
              <button
                type="button"
                aria-label={`Delete label ${label.name}`}
                onClick={() => remove.mutate(label.id)}
                className="text-xs text-gray-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400"
              >
                Delete
              </button>
            </div>
          ))}
          <ErrorText error={remove.error} />
        </div>
      )}
    </div>
  )
}
