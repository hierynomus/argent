import type {
  AddMortgageMemberBody, CloseDebtPartBody, CreateDebtRateBody, CreateMortgageBody, CreateMortgageExtraPaymentBody, CreateMortgagePartBody, LoanExtraPayment, LoanMember,
  LoanPart, LoanWithParts, MortgageExtraPayment, MortgageMember, MortgagePart, MortgageWithParts, PartCarryOver, DebtSchedule, PartPreview, PartRate, PreviewDebtPartBody, UpdateMortgagePartBody,
} from "@argent/shared"
import { http } from "./client"
import type { DebtKind } from "./keys"

/**
 * Mortgages and loans have identical shapes and endpoints (the shared bodies are literally
 * the same schemas), so the UI treats them as one thing: a `Debt`.
 */
export type Debt = MortgageWithParts | LoanWithParts
export type DebtPart = MortgagePart | LoanPart
export type DebtExtraPayment = MortgageExtraPayment | LoanExtraPayment
export type DebtMember = MortgageMember | LoanMember

export type CreateDebtBody = CreateMortgageBody
export type CreateDebtPartBody = CreateMortgagePartBody
export type UpdateDebtPartBody = UpdateMortgagePartBody
export type CreateDebtExtraPaymentBody = CreateMortgageExtraPaymentBody
export type CreateDebtRatePeriodBody = CreateDebtRateBody
export type AddDebtMemberBody = AddMortgageMemberBody

function debtApi(kind: DebtKind) {
  const base = `/${kind}`
  return {
    list: () => http.get<Debt[]>(base),
    create: (body: CreateDebtBody) => http.post<Debt>(base, body),
    remove: (id: string) => http.delete(`${base}/${id}`),
    schedule: (id: string) => http.get<DebtSchedule>(`${base}/${id}/schedule`),
    previewPart: (body: PreviewDebtPartBody) => http.post<PartPreview>(`${base}/preview-part`, body),
    addPart: (id: string, body: CreateDebtPartBody) => http.post<DebtPart>(`${base}/${id}/parts`, body),
    updatePart: (id: string, partId: string, body: UpdateDebtPartBody) => http.patch<DebtPart>(`${base}/${id}/parts/${partId}`, body),
    removePart: (id: string, partId: string) => http.delete(`${base}/${id}/parts/${partId}`),
    carryOver: (id: string, partId: string, date: string) => http.get<PartCarryOver>(`${base}/${id}/parts/${partId}/carry-over?date=${encodeURIComponent(date)}`),
    closePart: (id: string, partId: string, body: CloseDebtPartBody) =>
      http.post<{ closed: DebtPart; created: DebtPart[]; carriedOver: number; repaid: number }>(`${base}/${id}/parts/${partId}/close`, body),
    reopenPart: (id: string, partId: string) => http.delete(`${base}/${id}/parts/${partId}/close`),
    addRate: (id: string, partId: string, body: CreateDebtRatePeriodBody) => http.post<PartRate>(`${base}/${id}/parts/${partId}/rates`, body),
    removeRate: (id: string, partId: string, rateId: string) => http.delete(`${base}/${id}/parts/${partId}/rates/${rateId}`),
    addExtraPayment: (id: string, partId: string, body: CreateDebtExtraPaymentBody) =>
      http.post<DebtExtraPayment>(`${base}/${id}/parts/${partId}/payments`, body),
    removeExtraPayment: (id: string, partId: string, paymentId: string) =>
      http.delete(`${base}/${id}/parts/${partId}/payments/${paymentId}`),
    addMember: (id: string, body: AddDebtMemberBody) => http.post<DebtMember>(`${base}/${id}/members`, body),
    removeMember: (id: string, groupName: string) => http.delete(`${base}/${id}/members/${encodeURIComponent(groupName)}`),
  }
}

export const mortgagesApi = debtApi("mortgages")
export const loansApi = debtApi("loans")
export const debtApis = { mortgages: mortgagesApi, loans: loansApi } as const
export type DebtApi = ReturnType<typeof debtApi>
