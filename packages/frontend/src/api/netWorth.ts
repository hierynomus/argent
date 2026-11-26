import type { NetWorthHistory } from "@argent/shared"
import { http } from "./client"

/** Net worth over time in EUR, computed by the server from the dated facts (investments at cost). */
export const getNetWorthHistory = () => http.get<NetWorthHistory>("/net-worth/history")
