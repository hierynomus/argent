import type { Account, BalanceHistory, CreateAccountBody, UpdateAccountBody } from "@argent/shared"
import { http } from "./client"

export const getAccounts = () => http.get<Account[]>("/accounts")

export const updateAccount = (id: string, body: UpdateAccountBody) => http.patch<Account>(`/accounts/${id}`, body)

/** An account entered by hand (a bank without an export, or cash). */
export const createAccount = (body: CreateAccountBody) => http.post<Account>("/accounts", body)

/** Only accounts entered by hand, and only while they have no transactions. */
export const deleteAccount = (id: string) => http.delete(`/accounts/${id}`)

/** End-of-day balances of one account, computed by the server from its transactions. */
export const getBalanceHistory = (id: string) => http.get<BalanceHistory>(`/accounts/${id}/balance-history`)
