import { useSearchParams } from "react-router-dom"
import { useMe } from "../api"
import { AccountsTab } from "../features/settings/AccountsTab"
import { LabelsTab } from "../features/settings/LabelsTab"
import { ImportPanel } from "../features/import/ImportPanel"

// ─── Settings Page ────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams()

  const { data: me } = useMe()

  const tabs = [
    { id: "accounts", label: "Accounts" },
    { id: "labels", label: "Labels" },
    ...(me?.canImport ? [{ id: "import", label: "Import" }] : []),
  ]

  const activeTab = searchParams.get("tab") ?? "accounts"

  function setTab(id: string) {
    setSearchParams({ tab: id }, { replace: true })
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6">Settings</h1>

      <div className="flex gap-1 border-b border-gray-200 dark:border-gray-700 mb-6">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            aria-pressed={activeTab === t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === t.id
                ? "border-indigo-600 text-indigo-600 dark:text-indigo-400"
                : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === "accounts" && <AccountsTab />}
      {activeTab === "labels" && <LabelsTab />}
      {activeTab === "import" && me?.canImport && <ImportPanel />}
    </div>
  )
}
