import type { DebtKind } from "../../api"

/** Everything that differs between the Mortgages and Loans screens: wording and form hints. */
export interface DebtKindConfig {
  title: string
  /** singular, lower-case: "mortgage" */
  noun: string
  createPlaceholder: string
  emptyHint: string
  part: { namePlaceholder: string; principalPlaceholder: string; principalStep: string; ratePlaceholder: string }
  paymentNotesPlaceholder: string
}

export const DEBT_KINDS: Record<DebtKind, DebtKindConfig> = {
  mortgages: {
    title: "Mortgages",
    noun: "mortgage",
    createPlaceholder: "e.g. House Amsterdam",
    emptyHint: 'Click "+ New mortgage" to get started.',
    part: { namePlaceholder: "Part A", principalPlaceholder: "200000", principalStep: "1000", ratePlaceholder: "3.500" },
    paymentNotesPlaceholder: "e.g. bonus payment",
  },
  loans: {
    title: "Loans",
    noun: "loan",
    createPlaceholder: "e.g. Car loan",
    emptyHint: 'Click "+ New loan" to add a personal loan, car loan, or any other debt.',
    part: { namePlaceholder: "Main", principalPlaceholder: "10000", principalStep: "100", ratePlaceholder: "5.000" },
    paymentNotesPlaceholder: "optional",
  },
}
