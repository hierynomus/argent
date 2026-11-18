import type { Account, UpdateAccountBody } from "@argent/shared"
import { http } from "./client"

export const getAccounts = () => http.get<Account[]>("/accounts")

export const updateAccount = (id: string, body: UpdateAccountBody) => http.patch<Account>(`/accounts/${id}`, body)
