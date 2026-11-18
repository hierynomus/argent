import type { CreateSubscriptionBody, Subscription, UpdateSubscriptionBody } from "@argent/shared"
import { http } from "./client"

export interface SubscriptionTransaction {
  id: string
  bookingDate: string
  amount: string
  currency: string
  creditDebitIndicator: string
  description: string | null
}

export const getSubscriptions = () => http.get<Subscription[]>("/subscriptions")

export const createSubscription = (body: CreateSubscriptionBody) => http.post<Subscription>("/subscriptions", body)

export const updateSubscription = (id: string, body: UpdateSubscriptionBody) =>
  http.patch<Subscription>(`/subscriptions/${id}`, body)

export const deleteSubscription = (id: string) => http.delete(`/subscriptions/${id}`)

export const runSubscriptionDetection = () => http.post<{ detected: number }>("/subscriptions/detect")

export const getSubscriptionTransactions = (id: string) =>
  http.get<SubscriptionTransaction[]>(`/subscriptions/${id}/transactions`)
