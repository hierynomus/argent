import type { AdminSharingResponse } from "@argent/shared"
import { RoleBadge } from "../../components/ui"

export function SharingOverview({ sharing }: { sharing: AdminSharingResponse }) {
  const hasAny = sharing.portfolios.length > 0 || sharing.mortgages.length > 0 || sharing.loans.length > 0
  if (!hasAny) {
    return (
      <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 px-5 py-10 text-center text-gray-400 dark:text-gray-500 text-sm">
        No resources are shared with groups yet.
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {sharing.portfolios.length > 0 && (
        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-800">
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Portfolios</p>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wide border-b border-gray-100 dark:border-gray-800">
                <th className="px-5 py-2 text-left">Name</th>
                <th className="px-5 py-2 text-left">Type</th>
                <th className="px-5 py-2 text-left">Group</th>
                <th className="px-5 py-2 text-left">Role</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
              {sharing.portfolios.flatMap((p) =>
                p.members.map((m, i) => (
                  <tr key={`${p.id}-${m.groupName}`} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td className="px-5 py-2 text-gray-800 dark:text-gray-200">{i === 0 ? p.name : ""}</td>
                    <td className="px-5 py-2 text-gray-500 dark:text-gray-400 capitalize">{i === 0 ? p.type : ""}</td>
                    <td className="px-5 py-2 font-mono text-gray-700 dark:text-gray-300">{m.groupName}</td>
                    <td className="px-5 py-2"><RoleBadge role={m.role as "viewer" | "editor"} /></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {sharing.mortgages.length > 0 && (
        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-800">
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Mortgages</p>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wide border-b border-gray-100 dark:border-gray-800">
                <th className="px-5 py-2 text-left">Name</th>
                <th className="px-5 py-2 text-left">Group</th>
                <th className="px-5 py-2 text-left">Role</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
              {sharing.mortgages.flatMap((m) =>
                m.members.map((mem, i) => (
                  <tr key={`${m.id}-${mem.groupName}`} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td className="px-5 py-2 text-gray-800 dark:text-gray-200">{i === 0 ? m.name : ""}</td>
                    <td className="px-5 py-2 font-mono text-gray-700 dark:text-gray-300">{mem.groupName}</td>
                    <td className="px-5 py-2"><RoleBadge role={mem.role as "viewer" | "editor"} /></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {sharing.loans.length > 0 && (
        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-800">
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Loans</p>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wide border-b border-gray-100 dark:border-gray-800">
                <th className="px-5 py-2 text-left">Name</th>
                <th className="px-5 py-2 text-left">Group</th>
                <th className="px-5 py-2 text-left">Role</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
              {sharing.loans.flatMap((l) =>
                l.members.map((mem, i) => (
                  <tr key={`${l.id}-${mem.groupName}`} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td className="px-5 py-2 text-gray-800 dark:text-gray-200">{i === 0 ? l.name : ""}</td>
                    <td className="px-5 py-2 font-mono text-gray-700 dark:text-gray-300">{mem.groupName}</td>
                    <td className="px-5 py-2"><RoleBadge role={mem.role as "viewer" | "editor"} /></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
