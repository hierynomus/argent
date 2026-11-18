import type {
  AddPortfolioMemberBody, CreateEquityGrantBody, CreateEquityPlanBody, CreateEquityPriceBody, EquityPlanWithDetails, PortfolioMember,
  UpdateEquityGrantBody, UpdateEquityPlanBody,
} from "@argent/shared"
import { http } from "./client"

/** Equity compensation (stock options): a plan per company with grants and manually entered share prices. */
export const equityApi = {
  list: () => http.get<EquityPlanWithDetails[]>("/equity"),
  create: (body: CreateEquityPlanBody) => http.post<EquityPlanWithDetails>("/equity", body),
  update: (id: string, body: UpdateEquityPlanBody) => http.patch<EquityPlanWithDetails>(`/equity/${id}`, body),
  remove: (id: string) => http.delete(`/equity/${id}`),
  addGrant: (id: string, body: CreateEquityGrantBody) => http.post<EquityPlanWithDetails>(`/equity/${id}/grants`, body),
  updateGrant: (id: string, grantId: string, body: UpdateEquityGrantBody) => http.patch<EquityPlanWithDetails>(`/equity/${id}/grants/${grantId}`, body),
  removeGrant: (id: string, grantId: string) => http.delete(`/equity/${id}/grants/${grantId}`),
  addPrice: (id: string, body: CreateEquityPriceBody) => http.post<EquityPlanWithDetails>(`/equity/${id}/prices`, body),
  removePrice: (id: string, priceId: string) => http.delete(`/equity/${id}/prices/${priceId}`),
  addMember: (id: string, body: AddPortfolioMemberBody) => http.post<PortfolioMember>(`/equity/${id}/members`, body),
  removeMember: (id: string, groupName: string) => http.delete(`/equity/${id}/members/${encodeURIComponent(groupName)}`),
}
