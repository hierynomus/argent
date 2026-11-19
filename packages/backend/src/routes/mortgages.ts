import { mortgages, mortgageParts, mortgageExtraPayments, mortgageMembers } from "../db/schema"
import { getViewableMortgageIds, getEditableMortgageIds, canEditMortgage, canViewMortgage } from "../services/accessControl"
import { mortgageResource } from "../services/sharedResources"
import { debtRoutes } from "./debtRoutes"

// Mortgages and loans are one implementation (routes/debtRoutes.ts); only the tables and access checks differ.
export default debtRoutes({
  tables: { debts: mortgages, parts: mortgageParts, payments: mortgageExtraPayments, members: mortgageMembers },
  partDebtColumn: mortgageParts.mortgageId,
  memberDebtColumn: mortgageMembers.mortgageId,
  foreignKey: "mortgageId",
  resource: mortgageResource,
  getViewableIds: getViewableMortgageIds,
  getEditableIds: getEditableMortgageIds,
  canView: canViewMortgage,
  canEdit: canEditMortgage,
})
