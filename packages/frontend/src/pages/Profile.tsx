import { useAuth } from "react-oidc-context"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { getMe, updateMe } from "../api"
import type { UserProfile } from "@argent/shared"

type Theme = "light" | "dark" | "system"

const THEMES: { value: Theme; label: string; description: string }[] = [
  { value: "light", label: "Light", description: "Always light" },
  { value: "dark", label: "Dark", description: "Always dark" },
  { value: "system", label: "System", description: "Follow OS setting" },
]

export default function ProfilePage() {
  const auth = useAuth()
  const token = auth.user?.access_token ?? ""
  const qc = useQueryClient()

  const { data: me, isLoading } = useQuery({
    queryKey: ["me"],
    queryFn: () => getMe(token),
    enabled: !!token,
  })

  async function handleThemeChange(theme: Theme) {
    const updated = await updateMe(token, { theme })
    qc.setQueryData<UserProfile>(["me"], (prev) => (prev ? { ...prev, ...updated } : updated))
  }

  if (isLoading) {
    return <p className="text-gray-400 text-sm">Loading…</p>
  }

  return (
    <div className="max-w-lg">
      <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-6">Profile</h1>

      {/* Identity */}
      <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-800 mb-6">
        <div className="px-5 py-4">
          <p className="text-xs text-gray-400 dark:text-gray-500 mb-0.5">Name</p>
          <p className="text-sm text-gray-900 dark:text-gray-100 font-medium">
            {me?.name ?? <span className="text-gray-400 italic">Not set</span>}
          </p>
        </div>
        <div className="px-5 py-4">
          <p className="text-xs text-gray-400 dark:text-gray-500 mb-0.5">Email</p>
          <p className="text-sm text-gray-900 dark:text-gray-100 font-medium">
            {me?.email ?? <span className="text-gray-400 italic">Not set</span>}
          </p>
        </div>
        <div className="px-5 py-4">
          <p className="text-xs text-gray-400 dark:text-gray-500 mb-0.5">Role</p>
          <div className="flex items-center gap-2 mt-0.5">
            {me?.isAdmin && (
              <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300">
                Admin
              </span>
            )}
            {me?.canImport && (
              <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300">
                Import
              </span>
            )}
            {!me?.isAdmin && !me?.canImport && (
              <span className="text-sm text-gray-400">Viewer</span>
            )}
          </div>
        </div>
      </div>

      {/* Theme */}
      <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 px-5 py-4">
        <p className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-3">Theme</p>
        <div className="flex gap-2">
          {THEMES.map(({ value, label, description }) => {
            const active = (me?.theme ?? "system") === value
            return (
              <button
                key={value}
                onClick={() => handleThemeChange(value)}
                className={`flex-1 flex flex-col items-center gap-1 px-3 py-3 rounded-lg border text-sm transition-colors ${
                  active
                    ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300"
                    : "border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600"
                }`}
              >
                <ThemeIcon theme={value} active={active} />
                <span className="font-medium">{label}</span>
                <span className="text-xs text-gray-400 dark:text-gray-500">{description}</span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function ThemeIcon({ theme, active }: { theme: Theme; active: boolean }) {
  const color = active ? "currentColor" : "#9ca3af"
  if (theme === "light") {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
      </svg>
    )
  }
  if (theme === "dark") {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
      </svg>
    )
  }
  // system
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </svg>
  )
}
