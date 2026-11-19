import { loans, loanParts, loanExtraPayments, loanPartRates, loanMembers } from "../db/schema"
import { getViewableLoanIds, getEditableLoanIds, canEditLoan, canViewLoan } from "../services/accessControl"
import { loanResource } from "../services/sharedResources"
import { debtRoutes, type DebtKindConfig } from "./debtRoutes"

// Same implementation as mortgages (routes/debtRoutes.ts). The loan tables have the same columns, with
// `loanId` instead of `mortgageId`, hence the cast of the table set to the mortgage shape.
export default debtRoutes({
  tables: { debts: loans, parts: loanParts, payments: loanExtraPayments, rates: loanPartRates, members: loanMembers } as unknown as DebtKindConfig["tables"],
  partDebtColumn: loanParts.loanId,
  memberDebtColumn: loanMembers.loanId,
  foreignKey: "loanId",
  resource: loanResource,
  getViewableIds: getViewableLoanIds,
  getEditableIds: getEditableLoanIds,
  canView: canViewLoan,
  canEdit: canEditLoan,
})
