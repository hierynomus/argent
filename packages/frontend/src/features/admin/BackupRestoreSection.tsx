import { useRef, useState } from "react"
import { useMutation } from "@tanstack/react-query"
import { downloadBackup, restoreBackup, useInvalidate } from "../../api"
import { Button, ErrorText } from "../../components/ui"

/** Admin → Backup & Restore: download everything as JSON, or replace everything from such a file. */
export function BackupRestoreSection() {
  const invalidate = useInvalidate()
  const fileRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [confirming, setConfirming] = useState(false)

  const download = useMutation({ mutationFn: downloadBackup })

  const restore = useMutation({
    mutationFn: async (f: File) => {
      let data: unknown
      try {
        data = JSON.parse(await f.text())
      } catch {
        throw new Error("That file is not valid JSON — pick a backup downloaded from here.")
      }
      return restoreBackup(data)
    },
    onSuccess: () => {
      setFile(null)
      if (fileRef.current) fileRef.current.value = ""
      // the whole database was replaced: nothing already on screen can be trusted
      invalidate.everything()
    },
  })

  function chooseFile(e: React.ChangeEvent<HTMLInputElement>) {
    setFile(e.target.files?.[0] ?? null)
    setConfirming(false)
    restore.reset()
  }

  function confirmRestore() {
    if (!file) return
    setConfirming(false)
    restore.mutate(file)
  }

  return (
    <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-800">
      <div className="px-5 py-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Download backup</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Export all accounts, transactions, categories, portfolios and more as a single JSON file.</p>
            <ErrorText error={download.error} />
          </div>
          <Button size="sm" className="shrink-0 rounded-md px-4 py-1.5" disabled={download.isPending} onClick={() => download.mutate()}>
            {download.isPending ? "Exporting…" : "Download"}
          </Button>
        </div>
      </div>

      <div className="px-5 py-4">
        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Restore from backup</p>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 mb-3">
          Select a previously downloaded backup file. <span className="text-red-500 dark:text-red-400 font-medium">This will permanently replace all existing data.</span>
        </p>

        <div className="flex items-center gap-3 flex-wrap">
          <input
            ref={fileRef}
            type="file"
            accept=".json"
            aria-label="Backup file"
            className="text-sm text-gray-600 dark:text-gray-400 file:mr-3 file:py-1 file:px-3 file:rounded file:border-0 file:text-sm file:bg-gray-100 dark:file:bg-gray-700 file:text-gray-700 dark:file:text-gray-200 hover:file:bg-gray-200 dark:hover:file:bg-gray-600"
            onChange={chooseFile}
          />
          {file && !confirming && (
            <button type="button" onClick={() => setConfirming(true)} className="px-3 py-1 text-sm bg-red-600 text-white rounded-md hover:bg-red-700">
              Restore
            </button>
          )}
        </div>

        {confirming && (
          <div role="alertdialog" aria-label="Confirm restore" className="mt-3 p-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg">
            <p className="text-sm text-red-700 dark:text-red-300 font-medium mb-2">
              Are you sure? All current data will be deleted and replaced with the contents of <span className="font-mono">{file?.name}</span>.
            </p>
            <div className="flex gap-2">
              <button type="button" onClick={confirmRestore} className="px-3 py-1 text-sm bg-red-600 text-white rounded-md hover:bg-red-700">
                Yes, replace all data
              </button>
              <Button variant="muted-link" size="sm" className="!py-1" onClick={() => setConfirming(false)}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {restore.isPending && <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">Restoring…</p>}
        <ErrorText error={restore.error} />

        {restore.data && (
          <div className="mt-3 p-3 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg">
            <p className="text-sm font-medium text-green-700 dark:text-green-300 mb-1">Restore complete</p>
            <ul className="text-xs text-green-600 dark:text-green-400 space-y-0.5">
              {Object.entries(restore.data.restored).map(([k, v]) => (
                <li key={k}>
                  {k}: {v}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
