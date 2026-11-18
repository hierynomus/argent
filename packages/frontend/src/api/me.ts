import type { UserProfile } from "@argent/shared"
import { http } from "./client"

export const getMe = () => http.get<UserProfile>("/me")

export const updateMe = (settings: { theme?: "light" | "dark" | "system" }) => http.patch<UserProfile>("/me", settings)
