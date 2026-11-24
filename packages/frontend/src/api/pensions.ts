import type {
  AddPortfolioMemberBody, CreatePensionPlanBody, CreatePensionStatementBody, CreatePensionTransferBody, PensionPlanWithDetails, PortfolioMember,
  UpdatePensionPlanBody,
} from "@argent/shared"
import { http } from "./client"

/** Pensions: plans (state, employer, personal) with statements entered by hand, and transfers between plans. */
export const pensionsApi = {
  list: () => http.get<PensionPlanWithDetails[]>("/pensions"),
  create: (body: CreatePensionPlanBody) => http.post<PensionPlanWithDetails>("/pensions", body),
  update: (id: string, body: UpdatePensionPlanBody) => http.patch<PensionPlanWithDetails>(`/pensions/${id}`, body),
  remove: (id: string) => http.delete(`/pensions/${id}`),
  addStatement: (id: string, body: CreatePensionStatementBody) => http.post<PensionPlanWithDetails>(`/pensions/${id}/statements`, body),
  removeStatement: (id: string, statementId: string) => http.delete(`/pensions/${id}/statements/${statementId}`),
  /** both plans, as they are after the transfer */
  addTransfer: (body: CreatePensionTransferBody) => http.post<PensionPlanWithDetails[]>("/pensions/transfers", body),
  removeTransfer: (transferId: string) => http.delete(`/pensions/transfers/${transferId}`),
  addMember: (id: string, body: AddPortfolioMemberBody) => http.post<PortfolioMember>(`/pensions/${id}/members`, body),
  removeMember: (id: string, groupName: string) => http.delete(`/pensions/${id}/members/${encodeURIComponent(groupName)}`),
}
