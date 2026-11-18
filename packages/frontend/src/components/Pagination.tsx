import { Button } from "./ui"

/** "N things · Prev · Page X · Next" footer for a paged list. */
export function Pagination({
  page,
  pageSize,
  total,
  noun,
  onPage,
}: {
  page: number
  pageSize: number
  total: number
  /** plural, e.g. "transactions" */
  noun: string
  onPage: (page: number) => void
}) {
  return (
    <div className="flex items-center justify-between mt-4 text-sm text-gray-500 dark:text-gray-400">
      <span>
        {total} {noun}
      </span>
      <div className="flex gap-2">
        <Button variant="secondary" className="!px-3 !py-1 disabled:opacity-40" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Prev
        </Button>
        <span className="px-3 py-1">Page {page}</span>
        <Button variant="secondary" className="!px-3 !py-1 disabled:opacity-40" disabled={total <= page * pageSize} onClick={() => onPage(page + 1)}>
          Next
        </Button>
      </div>
    </div>
  )
}
