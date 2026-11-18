import type { Category, CreateCategoryBody } from "@argent/shared"
import { http } from "./client"

export const getCategories = () => http.get<Category[]>("/categories")

export const createCategory = (body: CreateCategoryBody) => http.post<Category>("/categories", body)

export const deleteCategory = (id: string) => http.delete(`/categories/${id}`)
