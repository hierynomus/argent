import type { InputHTMLAttributes, SelectHTMLAttributes } from "react"
import { cx } from "./cx"

const CONTROL =
  "border border-gray-300 dark:border-gray-600 rounded text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"

const PADDING = { sm: "px-2 py-1", md: "px-2 py-1.5", lg: "px-3 py-1.5" } as const

/** Vertical/horizontal padding of a form control. */
export type Density = keyof typeof PADDING

/** Text / number / date input. `className` is for layout (e.g. a width); `density` controls padding. */
export function Input({ density = "md", className, ...props }: InputHTMLAttributes<HTMLInputElement> & { density?: Density }) {
  return <input className={cx(CONTROL, PADDING[density], className)} {...props} />
}

export function Select({ density = "md", className, ...props }: SelectHTMLAttributes<HTMLSelectElement> & { density?: Density }) {
  return <select className={cx(CONTROL, PADDING[density], className)} {...props} />
}
