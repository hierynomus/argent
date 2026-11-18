export const CONTROL =
  "border border-gray-300 dark:border-gray-600 rounded text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"

export const PADDING = { sm: "px-2 py-1", md: "px-2 py-1.5", lg: "px-3 py-1.5" } as const

/** Vertical/horizontal padding of a form control. */
export type Density = keyof typeof PADDING
