import type {
  CreateTransactionBody, LinkTransferBody, Transaction, UpdateManualTransactionBody, PaginatedResponse, TransactionFilters, TransactionWithDetails, TransferPeerSummary, UpdateTransactionBody,
} from "@argent/shared"
import { http } from "./client"

export type TransactionQuery = TransactionFilters & { accountIds?: string[] }

export function getTransactions(filters: TransactionQuery) {
  const { accountIds, ...rest } = filters
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(rest)) {
    if (v !== undefined && v !== null && v !== "") params.set(k, String(v))
  }
  if (accountIds?.length) params.set("accountIds", accountIds.join(","))
  return http.get<PaginatedResponse<TransactionWithDetails>>(`/transactions?${params}`)
}

export const updateTransaction = (id: string, body: UpdateTransactionBody) =>
  http.patch<TransactionWithDetails>(`/transactions/${id}`, body)

export const getTransferSuggestions = (id: string) =>
  http.get<TransferPeerSummary[]>(`/transactions/${id}/transfer-suggestions`)

export const linkTransfer = (id: string, body: LinkTransferBody) =>
  http.post<TransactionWithDetails>(`/transactions/${id}/transfer`, body)

export const unlinkTransfer = (id: string) => http.delete(`/transactions/${id}/transfer`)

/** Enter a transaction by hand. */
export const createTransaction = (body: CreateTransactionBody) => http.post<Transaction>("/transactions", body)

/** Edit a transaction that was entered by hand (imported ones are read-only). */
export const editTransaction = (id: string, body: UpdateManualTransactionBody) => http.put<Transaction>(`/transactions/${id}`, body)

export const deleteTransaction = (id: string) => http.delete(`/transactions/${id}`)
