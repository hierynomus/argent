import { AccountsByType } from "../features/accounts/AccountsByType"

export default function SavingsPage() {
  return (
    <AccountsByType
      title="Savings"
      noun="savings accounts"
      emptyHint="Mark an account as Savings in Overview → My Accounts."
      matches={(a) => a.type === "savings"}
    />
  )
}
