import { describe, expect, test } from "vitest"
import { renderApp, screen } from "../../test/render"
import Pagination from "./Pagination.vue"

const mountPage = (props: { page: number; total: number; pageSize?: number }) =>
  renderApp(Pagination, { props: { pageSize: 50, noun: "transactions", ...props } })

describe("Pagination", () => {
  test("shows the total with its noun and the current page", async () => {
    await mountPage({ page: 2, total: 120 })
    expect(screen.getByText("120 transactions")).toBeInTheDocument()
    expect(screen.getByText("Page 2")).toBeInTheDocument()
  })

  test("Prev is disabled on the first page; Next on the last", async () => {
    const first = await mountPage({ page: 1, total: 120 })
    expect(screen.getByRole("button", { name: "Prev" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "Next" })).toBeEnabled()
    first.unmount()
    await mountPage({ page: 3, total: 120 }) // 3 × 50 ≥ 120
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "Prev" })).toBeEnabled()
  })

  test("a total that exactly fills the page has no next page", async () => {
    await mountPage({ page: 1, total: 50 })
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled()
  })

  test("an empty list has nowhere to go", async () => {
    await mountPage({ page: 1, total: 0 })
    expect(screen.getByRole("button", { name: "Prev" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled()
  })

  test("emits the requested page number", async () => {
    const { user, emitted } = await mountPage({ page: 2, total: 200 })
    await user.click(screen.getByRole("button", { name: "Next" }))
    await user.click(screen.getByRole("button", { name: "Prev" }))
    expect(emitted().page).toEqual([[3], [1]])
  })
})
