import type { PensionKind, PensionState } from "@argent/shared"

/** What a plan is, in words (generic, with the Dutch name where it helps). */
export const KIND_LABEL: Record<PensionKind, string> = {
  state: "State pension",
  occupational_db: "Employer · rights (DB)",
  occupational_dc: "Employer · pot (DC)",
  personal: "Personal",
}

export const KIND_OPTIONS = (Object.keys(KIND_LABEL) as PensionKind[]).map((value) => ({ value, label: KIND_LABEL[value] }))

export const STATE_LABEL: Record<PensionState, string> = { active: "Active", frozen: "Frozen", closed: "Closed" }

export const STATE_CLASS: Record<PensionState, string> = {
  active: "bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300",
  frozen: "bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300",
  closed: "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400",
}
