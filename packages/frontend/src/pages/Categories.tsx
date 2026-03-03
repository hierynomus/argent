import { useState } from "react"
import { useAuth } from "react-oidc-context"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { getCategories, createCategory, deleteCategory } from "../api"

export default function CategoriesPage() {
  const auth = useAuth()
  const token = auth.user?.access_token ?? ""
  const qc = useQueryClient()
  const [name, setName] = useState("")
  const [color, setColor] = useState("#6366f1")

  const { data: categories, isLoading } = useQuery({
    queryKey: ["categories"],
    queryFn: () => getCategories(token),
  })

  const create = useMutation({
    mutationFn: () => createCategory(token, { name, color }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["categories"] })
      setName("")
    },
  })

  const remove = useMutation({
    mutationFn: (id: string) => deleteCategory(token, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["categories"] }),
  })

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-6">Categories</h1>

      {/* Add category */}
      <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-4 mb-6">
        <h2 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Add category</h2>
        <div className="flex gap-3">
          <input
            type="text"
            placeholder="Category name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="flex-1 border border-gray-300 dark:border-gray-600 rounded-md px-3 py-1.5 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="w-10 h-9 rounded border border-gray-300 dark:border-gray-600 cursor-pointer bg-white dark:bg-gray-800"
            title="Pick color"
          />
          <button
            onClick={() => create.mutate()}
            disabled={!name.trim() || create.isPending}
            className="px-4 py-1.5 bg-indigo-600 text-white text-sm rounded-md hover:bg-indigo-700 disabled:opacity-50"
          >
            Add
          </button>
        </div>
      </div>

      {/* Category list */}
      {isLoading ? (
        <p className="text-gray-400 dark:text-gray-500">Loading…</p>
      ) : (
        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-800">
          {categories?.length === 0 && (
            <p className="px-4 py-6 text-gray-400 dark:text-gray-500 text-sm text-center">
              No categories yet.
            </p>
          )}
          {categories?.map((cat) => (
            <div key={cat.id} className="flex items-center px-4 py-3">
              <span
                className="w-3 h-3 rounded-full mr-3 flex-shrink-0"
                style={{ backgroundColor: cat.color ?? "#9ca3af" }}
              />
              <span className="flex-1 text-sm text-gray-900 dark:text-gray-100">{cat.name}</span>
              <button
                onClick={() => remove.mutate(cat.id)}
                className="text-xs text-gray-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400"
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
