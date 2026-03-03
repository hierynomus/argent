import { useState, useRef } from "react"
import { useAuth } from "react-oidc-context"
import { importCamt053, importCamt053Zip } from "../api"
import type { ImportResult } from "@argent/shared"

type FileResult =
  | { filename: string; status: "pending" }
  | { filename: string; status: "importing" }
  | { filename: string; status: "done"; result: ImportResult }
  | { filename: string; status: "error"; error: string }

export default function ImportPage() {
  const auth = useAuth()
  const token = auth.user?.access_token ?? ""
  const inputRef = useRef<HTMLInputElement>(null)
  const [items, setItems] = useState<FileResult[]>([])

  function updateItem(filename: string, update: Partial<FileResult>) {
    setItems((prev) =>
      prev.map((item) => (item.filename === filename ? { ...item, ...update } : item))
    )
  }

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return

    const fileArray = Array.from(files)

    // Initialise all items as pending so the list renders immediately
    setItems(fileArray.map((f) => ({ filename: f.name, status: "pending" })))

    for (const file of fileArray) {
      updateItem(file.name, { status: "importing" })
      try {
        if (file.name.toLowerCase().endsWith(".zip")) {
          const { results, errors } = await importCamt053Zip(token, file)
          // Replace the ZIP row with per-file rows
          setItems((prev) => {
            const without = prev.filter((i) => i.filename !== file.name)
            const expanded: FileResult[] = [
              ...results.map((r) => ({
                filename: r.filename,
                status: "done" as const,
                result: { accountIban: r.accountIban, imported: r.imported, skipped: r.skipped },
              })),
              ...errors.map((e) => ({
                filename: e.filename,
                status: "error" as const,
                error: e.error,
              })),
            ]
            return [...without, ...expanded]
          })
        } else {
          const result = await importCamt053(token, file)
          updateItem(file.name, { status: "done", result })
        }
      } catch (err) {
        updateItem(file.name, { status: "error", error: (err as Error).message })
      }
    }
  }

  const isDone = items.length > 0 && items.every((i) => i.status === "done" || i.status === "error")
  const totalImported = items.reduce(
    (sum, i) => sum + (i.status === "done" ? i.result.imported : 0),
    0
  )
  const totalSkipped = items.reduce(
    (sum, i) => sum + (i.status === "done" ? i.result.skipped : 0),
    0
  )

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-6">Import CAMT.053</h1>

      <div
        className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-12 text-center cursor-pointer hover:border-indigo-400 dark:hover:border-indigo-500 transition-colors"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault()
          handleFiles(e.dataTransfer.files)
        }}
      >
        <p className="text-gray-500 dark:text-gray-400 mb-2">Drag & drop CAMT.053 XML or ZIP files here</p>
        <p className="text-sm text-gray-400 dark:text-gray-500">or click to select files</p>
        <input
          ref={inputRef}
          type="file"
          accept=".xml,.zip"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>

      {items.length > 0 && (
        <div className="mt-6">
          <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  <th className="px-4 py-3">File</th>
                  <th className="px-4 py-3">Account</th>
                  <th className="px-4 py-3 text-right">Imported</th>
                  <th className="px-4 py-3 text-right">Skipped</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {items.map((item) => (
                  <tr key={item.filename}>
                    <td className="px-4 py-3 font-mono text-xs text-gray-600 dark:text-gray-400 max-w-[200px] truncate">
                      {item.filename}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-500 dark:text-gray-400">
                      {item.status === "done" ? item.result.accountIban : "—"}
                    </td>
                    <td className="px-4 py-3 text-right text-green-700 dark:text-green-400 font-medium">
                      {item.status === "done" ? item.result.imported : "—"}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-400 dark:text-gray-500">
                      {item.status === "done" ? item.result.skipped : "—"}
                    </td>
                    <td className="px-4 py-3">
                      {item.status === "pending" && (
                        <span className="text-gray-400 dark:text-gray-500 text-xs">Waiting…</span>
                      )}
                      {item.status === "importing" && (
                        <span className="text-indigo-600 dark:text-indigo-400 text-xs">Importing…</span>
                      )}
                      {item.status === "done" && (
                        <span className="text-green-600 dark:text-green-400 text-xs">Done</span>
                      )}
                      {item.status === "error" && (
                        <span className="text-red-600 dark:text-red-400 text-xs" title={item.error}>
                          Error
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              {isDone && items.length > 1 && (
                <tfoot>
                  <tr className="border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-xs font-medium text-gray-600 dark:text-gray-400">
                    <td className="px-4 py-2" colSpan={2}>
                      Total
                    </td>
                    <td className="px-4 py-2 text-right text-green-700 dark:text-green-400">{totalImported}</td>
                    <td className="px-4 py-2 text-right text-gray-400 dark:text-gray-500">{totalSkipped}</td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          {items.some((i) => i.status === "error") && (
            <div className="mt-3 space-y-1">
              {items
                .filter((i) => i.status === "error")
                .map((i) => (
                  <p key={i.filename} className="text-xs text-red-600 dark:text-red-400">
                    <span className="font-mono">{i.filename}</span>: {(i as { error: string }).error}
                  </p>
                ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
