import { useState } from "react"
import { useMutation } from "@tanstack/react-query"
import { Button, ErrorText, Field, FieldGroup, Input, RoleBadge, SegmentedControl } from "./ui"

export interface SharingMember {
  groupName: string
  role: "viewer" | "editor"
}

/**
 * "Shared access": which groups can see (viewer) or edit (editor) a resource, with a form to add
 * a group and a button to revoke one. Used for portfolios, mortgages and loans.
 *
 * The panel owns its form state and shows server errors; the caller only says how to add and remove
 * (and refreshes its own data when those finish).
 */
export function SharingPanel({
  members,
  onAdd,
  onRemove,
}: {
  members: SharingMember[]
  onAdd: (member: SharingMember) => Promise<unknown>
  onRemove: (groupName: string) => Promise<unknown>
}) {
  const [groupName, setGroupName] = useState("")
  const [role, setRole] = useState<"viewer" | "editor">("viewer")

  const add = useMutation({
    mutationFn: () => onAdd({ groupName: groupName.trim(), role }),
    onSuccess: () => setGroupName(""),
  })
  // (wrapped: useMutation would otherwise pass its own context as a second argument to the caller's function)
  const remove = useMutation({ mutationFn: (group: string) => onRemove(group) })

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-3">Shared access</p>

      {members.length === 0 ? (
        <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">Not shared with anyone.</p>
      ) : (
        <div className="flex flex-col gap-1.5 mb-3">
          {members.map((m) => (
            <div key={m.groupName} className="flex items-center gap-3">
              <span className="text-sm text-gray-700 dark:text-gray-300 font-mono">{m.groupName}</span>
              <RoleBadge role={m.role} />
              <Button variant="danger-link" size="xs" disabled={remove.isPending} onClick={() => remove.mutate(m.groupName)}>
                Remove
              </Button>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2 flex-wrap items-end">
        <Field label="Group name">
          <Input density="sm" type="text" placeholder="e.g. family" value={groupName} onChange={(e) => setGroupName(e.target.value)} className="w-44" />
        </Field>
        <FieldGroup label="Role">
          <SegmentedControl options={["viewer", "editor"] as const} value={role} onChange={setRole} capitalize />
        </FieldGroup>
        <Button disabled={!groupName.trim() || add.isPending} onClick={() => add.mutate()}>
          + Add
        </Button>
      </div>
      <ErrorText error={add.error ?? remove.error} />
    </div>
  )
}
