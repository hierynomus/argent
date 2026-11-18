import { AccountsByType } from "../features/accounts/AccountsByType"

export default function CheckingPage() {
  return (
    <AccountsByType
      title="Checking"
      noun="checking accounts"
      emptyHint="Import a CAMT.053 file to get started."
      // accounts imported before the type column existed have no type: treat them as checking
      matches={(a) => a.type === "checking" || a.type == null}
    />
  )
}
