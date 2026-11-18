import { useState } from "react"
import { useMutation } from "@tanstack/react-query"
import type { AccountWithMembers } from "@argent/shared"
import { addMember, removeMember, updateAccountOwner } from "../../api"
import { Button, ErrorText, Input, RoleBadge, Select } from "../../components/ui"

/** Shows who owns an account and lets an admin reassign it (by Authentik user sub), or clear the owner. */
function OwnerRow({ account, onChanged }: { account: AccountWithMembers; onChanged: () => void }) {
  const [editing, setEditing] = useState(false)
  const [ownerSub, setOwnerSub] = useState(account.ownerSub ?? "")

  const save = useMutation({
    mutationFn: () => updateAccountOwner(account.id, ownerSub.trim() || null),
    onSuccess: () => {
      setEditing(false)
      onChanged()
    },
  })
  const cancel = () => {
    setEditing(false)
    setOwnerSub(account.ownerSub ?? "")
    save.reset()
  }

  if (!editing) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-500 dark:text-gray-400">Owner:</span>
        {account.ownerProfile ? (
          <span className="text-xs text-gray-700 dark:text-gray-300">{account.ownerProfile.email}</span>
        ) : account.ownerSub ? (
          <span className="text-xs font-mono text-gray-500 dark:text-gray-400">{account.ownerSub}</span>
        ) : (
          <span className="text-xs text-gray-400 dark:text-gray-500 italic">No owner</span>
        )}
        <Button
          variant="link"
          size="xs"
          className="font-normal"
          onClick={() => {
            setOwnerSub(account.ownerSub ?? "")
            setEditing(true)
          }}
        >
          Edit
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <Input
          autoFocus
          density="sm"
          type="text"
          placeholder="User sub (Authentik UUID)"
          aria-label="Owner (user sub)"
          value={ownerSub}
          onChange={(e) => setOwnerSub(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && save.mutate()}
          className="flex-1 rounded-md text-xs font-mono"
        />
        <Button size="xs" className="rounded-md px-2.5 py-1" disabled={save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? "Saving…" : "Save"}
        </Button>
        <Button variant="muted-link" size="xs" className="px-2 py-1" onClick={cancel}>
          Cancel
        </Button>
      </div>
      <ErrorText error={save.error} />
    </div>
  )
}

/** The groups that may see (viewer) or edit (editor) an account, with revoke buttons and an "add group" row. */
function GroupAccess({ account, onChanged }: { account: AccountWithMembers; onChanged: () => void }) {
  const [adding, setAdding] = useState(false)
  const [groupName, setGroupName] = useState("")
  const [role, setRole] = useState<"viewer" | "editor">("viewer")

  const add = useMutation({
    mutationFn: () => addMember(account.id, groupName.trim(), role),
    onSuccess: () => {
      setAdding(false)
      setGroupName("")
      setRole("viewer")
      onChanged()
    },
  })
  const remove = useMutation({ mutationFn: (group: string) => removeMember(account.id, group), onSuccess: onChanged })

  const stopAdding = () => {
    setAdding(false)
    setGroupName("")
    add.reset()
  }

  return (
    <div className="divide-y divide-gray-50 dark:divide-gray-800">
      {account.members.length === 0 ? (
        <div className="px-5 py-3 text-sm text-gray-400 dark:text-gray-500 italic">No groups assigned</div>
      ) : (
        account.members.map((member) => (
          <div key={member.groupName} className="px-5 py-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-sm text-gray-700 dark:text-gray-300 font-medium truncate">{member.groupName}</span>
              <RoleBadge role={member.role} />
            </div>
            <Button variant="danger-link" size="xs" className="font-medium shrink-0" disabled={remove.isPending} onClick={() => remove.mutate(member.groupName)}>
              Remove
            </Button>
          </div>
        ))
      )}
      {remove.error && (
        <div className="px-5 py-2">
          <ErrorText error={remove.error} />
        </div>
      )}

      <div className="px-5 py-3">
        {adding ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <Input
                autoFocus
                type="text"
                placeholder="Authentik group name"
                aria-label="Group name"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && groupName.trim() && add.mutate()}
                className="flex-1 rounded-md"
              />
              <Select aria-label="Role" value={role} onChange={(e) => setRole(e.target.value as "viewer" | "editor")} className="rounded-md">
                <option value="viewer">Viewer</option>
                <option value="editor">Editor</option>
              </Select>
              <Button className="rounded-md" disabled={!groupName.trim() || add.isPending} onClick={() => add.mutate()}>
                {add.isPending ? "Adding…" : "Add"}
              </Button>
              <Button variant="muted-link" size="sm" className="px-2" onClick={stopAdding}>
                Cancel
              </Button>
            </div>
            <ErrorText error={add.error} />
          </div>
        ) : (
          <Button variant="link" size="xs" onClick={() => setAdding(true)}>
            + Add group
          </Button>
        )}
      </div>
    </div>
  )
}

/** Admin view of one account: owner and group access. */
export function AccountMemberCard({ account, onChanged }: { account: AccountWithMembers; onChanged: () => void }) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800">
        <div className="font-medium text-gray-900 dark:text-gray-100">
          {account.name ?? <span className="text-gray-400 dark:text-gray-500 italic">Unnamed</span>}
        </div>
        <div className="font-mono text-xs text-gray-400 dark:text-gray-500 mt-0.5">{account.iban}</div>
        <div className="mt-2">
          <OwnerRow account={account} onChanged={onChanged} />
        </div>
      </div>
      <GroupAccess account={account} onChanged={onChanged} />
    </div>
  )
}
