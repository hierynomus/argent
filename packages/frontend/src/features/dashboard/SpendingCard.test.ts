import { describe, expect, test } from "vitest"
import { mockApi } from "../../../test/fakeApi"
import { category } from "../../../test/fixtures"
import { renderApp, screen, waitFor } from "../../../test/render"
import SpendingCard from "./SpendingCard.vue"

const food = category({ id: "food", name: "Food" })
const lunch = category({ id: "lunch", name: "Lunch", parentId: "food" })
const summary = (from: string, to: string, expenses: number, byCategory: Array<[string | null, number]>) => ({
  from, to, currency: "EUR", income: 0, expenses, byCategory: byCategory.map(([categoryId, e]) => ({ categoryId, expenses: e, income: 0 })),
})

/** November 2026 spent 150 on food, October 100; September 40, August 60 */
const setup = async (today = "2026-11-26") => {
  const api = mockApi({
    "GET /categories": [food, lunch],
    "GET /transactions/summary": ({ query }: any) => {
      const bymonth: Record<string, ReturnType<typeof summary>> = {
        "2026-11-01": summary("2026-11-01", "2026-11-30", 150, [["lunch", 50], ["food", 100]]),
        "2026-10-01": summary("2026-10-01", "2026-10-31", 100, [["food", 100]]),
        "2026-09-01": summary("2026-09-01", "2026-09-30", 40, [["food", 40]]),
        "2026-08-01": summary("2026-08-01", "2026-08-31", 60, [["food", 60]]),
      }
      return bymonth[query.from] ?? summary(query.from, query.to, 0, [])
    },
  })
  return { api, ...(await renderApp(SpendingCard, { props: { today }, routes: [{ path: "/overview", component: { render: () => null } }] })) }
}

describe("SpendingCard", () => {
  test("a bar per category (subcategories with their parent) and the change against last month", async () => {
    await setup()
    const card = await screen.findByLabelText("Spending by category")
    await waitFor(() => expect(card).toHaveTextContent("Food"))
    expect(card).toHaveTextContent("▲ 50%") // 150 against 100: more is red
    expect(card).toHaveTextContent("november 2026")
    expect(screen.getByRole("img", { name: /Food: .*150.*, .*100.* last month/ })).toBeInTheDocument()
  })

  test("each category links to the transactions behind it", async () => {
    await setup()
    const link = await screen.findByRole("link", { name: /Food/ })
    const href = link.getAttribute("href")!
    expect(href).toContain("/overview?")
    const query = new URLSearchParams(href.split("?")[1])
    expect(query.get("categories")).toBe("food,lunch") // the parent and its subcategory
    expect(query.get("from")).toBe("2026-11-01")
    expect(query.get("to")).toBe("2026-11-30")
    expect(query.get("direction")).toBe("DBIT")
    expect(query.get("excludeTransfers")).toBe("1")
    expect(query.get("label")).toBe("Food")
  })

  test("steps back through the months, and compares with the 3-month average on request", async () => {
    const { user } = await setup()
    await screen.findByText("november 2026")
    await user.click(screen.getByRole("button", { name: "Previous month" }))
    expect(await screen.findByText("oktober 2026")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Next month" })).toBeEnabled()
    await waitFor(() => expect(screen.getByLabelText("Spending by category")).toHaveTextContent("Food"))
    await user.click(screen.getByRole("button", { name: "Next month" }))
    expect(await screen.findByText("november 2026")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Next month" })).toBeDisabled() // nothing beyond this month

    await user.click(screen.getByRole("button", { name: "3-month average" }))
    // Oct 100, Sep 40, Aug 60 average 66.67 -> 150 is 125% more
    await waitFor(() => expect(screen.getByLabelText("Spending by category")).toHaveTextContent("▲ 125% vs the 3-month average"))
  })

  test("says so when nothing was spent in a month", async () => {
    await setup("2026-05-10")
    expect(await screen.findByText("No spending yet this month.")).toBeInTheDocument()
  })
})
