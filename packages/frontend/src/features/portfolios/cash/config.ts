import type { CashMovementType } from "@argent/shared"

export const CASH_TYPE_LABELS: Record<CashMovementType, string> = {
  deposit: "Deposit",
  withdrawal: "Withdrawal",
  fee: "Fee",
  interest: "Interest",
}

/** +1 when the movement adds to the cash, -1 when it takes from it. */
export const CASH_DIRECTION: Record<CashMovementType, 1 | -1> = { deposit: 1, interest: 1, withdrawal: -1, fee: -1 }
