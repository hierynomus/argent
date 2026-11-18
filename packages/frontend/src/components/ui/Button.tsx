import type { ButtonHTMLAttributes } from "react"
import { cx } from "./cx"

export type ButtonVariant = "primary" | "secondary" | "link" | "danger-link" | "muted-link"

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "rounded bg-indigo-600 text-white font-medium hover:bg-indigo-700 disabled:opacity-50",
  secondary:
    "rounded border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50",
  link: "text-indigo-600 dark:text-indigo-400 hover:underline font-medium",
  "danger-link": "text-red-500 hover:text-red-700 dark:hover:text-red-400 disabled:opacity-50",
  "muted-link": "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200",
}

const SIZES = { sm: "px-3 py-1.5 text-sm", md: "px-4 py-2 text-sm", xs: "text-xs" } as const

/**
 * The app's button. Defaults to `type="button"` so a button inside a <form> never submits by accident;
 * pass `type="submit"` where that is wanted.
 */
export function Button({
  variant = "primary",
  size,
  className,
  type = "button",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: keyof typeof SIZES }) {
  // links are text-sized, not padded
  const resolvedSize = size ?? (variant === "primary" || variant === "secondary" ? "sm" : undefined)
  return <button type={type} className={cx(VARIANTS[variant], resolvedSize && SIZES[resolvedSize], className)} {...rest} />
}
