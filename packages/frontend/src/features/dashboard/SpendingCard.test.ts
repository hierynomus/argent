import { describe, expect, test } from "vitest"
import { category, transaction } from "../../../test/fixtures"
import { renderApp, screen } from "../../../test/render"
import SpendingCard from "./SpendingCard.vue"

const food = category({ id: "food", name: "Food" })
const spend = (amount: string) => transaction({ amount, category: food, categoryId: "food" })

describe("SpendingCard", () => {
  test("a bar per category with the change against last month", async () => {
    await renderApp(SpendingCard, { props: { current: [spend("150")], previous: [spend("100")], categories: [food], loading: false, monthLabel: "november 2026" } })
    const card = screen.getByLabelText("Spending by category")
    expect(card).toHaveTextContent("Food")
    expect(card).toHaveTextContent("▲ 50%") // more than last month is red
    expect(screen.getByRole("img", { name: /Food: .*150.* this month, .*100.* last month/ })).toBeInTheDocument()
  })

  test("says so when nothing was spent", async () => {
    await renderApp(SpendingCard, { props: { current: [], previous: [], categories: [], loading: false, monthLabel: "november 2026" } })
    expect(screen.getByText("No spending yet this month.")).toBeInTheDocument()
  })
})
