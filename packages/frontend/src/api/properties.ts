import type {
  AddPortfolioMemberBody, CreatePropertyBody, CreatePropertyValuationBody, PortfolioMember, PropertyValuation, PropertyWithDetails,
  SetPropertyLinksBody, UpdatePropertyBody,
} from "@argent/shared"
import { http } from "./client"

/** Property (house, car, …): valuations are manual, the current value is the latest one, debt comes from linked mortgages/loans. */
export const propertiesApi = {
  list: () => http.get<PropertyWithDetails[]>("/properties"),
  create: (body: CreatePropertyBody) => http.post<PropertyWithDetails>("/properties", body),
  update: (id: string, body: UpdatePropertyBody) => http.patch<PropertyWithDetails>(`/properties/${id}`, body),
  remove: (id: string) => http.delete(`/properties/${id}`),
  addValuation: (id: string, body: CreatePropertyValuationBody) => http.post<PropertyValuation>(`/properties/${id}/valuations`, body),
  removeValuation: (id: string, valuationId: string) => http.delete(`/properties/${id}/valuations/${valuationId}`),
  setLinks: (id: string, body: SetPropertyLinksBody) => http.put<PropertyWithDetails>(`/properties/${id}/links`, body),
  addMember: (id: string, body: AddPortfolioMemberBody) => http.post<PortfolioMember>(`/properties/${id}/members`, body),
  removeMember: (id: string, groupName: string) => http.delete(`/properties/${id}/members/${encodeURIComponent(groupName)}`),
}
