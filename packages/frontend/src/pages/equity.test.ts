import { describe, expect, test } from "vitest"
import { mockApi, respond } from "../../test/fakeApi"
import { equityPlan } from "../../test/fixtures"
import { renderApp, screen, waitFor, within } from "../../test/render"
import EquityPage from "./Equity.vue"

const today = () => new Date().toISOString().slice(0, 10)

const setup = async (list: any[] = [equityPlan()], extra: Record<string, any> = {}) => {
  const api = mockApi({
    "GET /equity": list,
    "POST /equity": ({ body }: any) => ({ ...equityPlan({ id: "new" }), ...body }),
    "PATCH /equity/:id": ({ body }: any) => ({ ...equityPlan(), ...body }),
    "DELETE /equity/:id": respond(204),
    "POST /equity/:id/grants": equityPlan(),
    "PATCH /equity/:id/grants/:gid": equityPlan(),
    "DELETE /equity/:id/grants/:gid": respond(204),
    "POST /equity/:id/prices": equityPlan(),
    "DELETE /equity/:id/prices/:pid": respond(204),
    "POST /equity/:id/members": ({ body }: any) => body,
    "DELETE /equity/:id/members/:group": respond(204),
    ...extra,
  })
  return { api, ...(await renderApp(EquityPage)) }
}
const card = async () => within(await screen.findByRole("region", { name: "Acme BV" }))

describe("Options page: the overview", () => {
  test("a company shows its share price, what has vested (counting in net worth), what is still vesting and what is on exit", async () => {
    await setup()
    const c = await card()
    expect(c.getByText("€12,00", { selector: "dd" })).toBeInTheDocument() // share price
    expect(c.getByText(/as of .*2024/)).toBeInTheDocument()
    expect(c.getByText("€24.000,00", { selector: "dd.text-green-600" })).toBeInTheDocument() // vested value
    expect(c.getByText(/2\.400 options · counts in net worth/)).toBeInTheDocument()
    expect(c.getByText(/1\.000 options · not counted/)).toBeInTheDocument()
    expect(c.getByText("€10.000,00", { selector: "dd" })).toBeInTheDocument() // on exit
    expect(c.getByText(/before tax/)).toBeInTheDocument()
  })

  test("the grants are listed with their type, vesting progress, next vesting date and value", async () => {
    await setup()
    const c = await card()
    const time = c.getByText("2023 grant").closest("tr")!
    expect(time).toHaveTextContent("over time")
    expect(time).toHaveTextContent("4.800")
    expect(time).toHaveTextContent("2.400 vested")
    expect(time).toHaveTextContent("12 mo cliff · 48 mo")
    expect(time).toHaveTextContent("€24.000,00")
    expect(time).toHaveTextContent("vested")
    const exit = c.getByText("Exit tranche").closest("tr")!
    expect(exit).toHaveTextContent("on exit")
    expect(exit).toHaveTextContent("pays out on an exit")
    expect(exit).toHaveTextContent("€10.000,00")
    expect(exit).toHaveTextContent("if exit today")
  })

  test("a fully vested grant says so instead of a next date", async () => {
    const full = equityPlan()
    full.grants[0] = { ...full.grants[0], vested: 4800, unvested: 0, nextVestingDate: null }
    await setup([full])
    expect((await card()).getByText("2023 grant").closest("tr")).toHaveTextContent("fully vested")
  })

  test("without a share price the values are unknown, and it says what to add", async () => {
    await setup([equityPlan({ prices: [], currentPrice: null, currentPriceDate: null, totals: { granted: 5800, vested: 2400, unvested: 2400, onExit: 1000, vestedValue: null, unvestedValue: null, onExitValue: null } })])
    const c = await card()
    expect(c.getByText("no price yet")).toBeInTheDocument()
    expect(c.getAllByText("—").length).toBeGreaterThanOrEqual(4)
    expect(c.getByText(/No share price yet/)).toBeInTheDocument()
  })

  test("with no grants it explains that a mixed plan is two grants", async () => {
    await setup([equityPlan({ grants: [], totals: { granted: 0, vested: 0, unvested: 0, onExit: 0, vestedValue: 0, unvestedValue: 0, onExitValue: 0 } })])
    expect((await card()).getByText(/two grants/)).toBeInTheDocument()
  })

  test("totals are shown per currency and never mixed", async () => {
    await setup([equityPlan(), equityPlan({ id: "eq2", name: "Other Inc", currency: "USD" })])
    const eur = await screen.findByRole("region", { name: "EUR totals" })
    const usd = screen.getByRole("region", { name: "USD totals" })
    expect(within(eur).getAllByText("€24.000,00", { selector: "p" })).toHaveLength(2) // vested and still vesting
    expect(within(eur).getByText("€10.000,00", { selector: "p" })).toBeInTheDocument()
    expect(within(usd).getAllByText("$24.000,00", { selector: "p" })).toHaveLength(2)
  })

  test("with no company it explains what to do", async () => {
    await setup([])
    expect(await screen.findByText("No options yet.")).toBeInTheDocument()
    expect(screen.getByText(/Only the vested value counts/)).toBeInTheDocument()
  })
})

describe("Options page: grants", () => {
  const openForm = async (user: any) => user.click(await screen.findByRole("button", { name: "+ Add grant" }))

  test("adding a time-vested grant: vesting starts on the grant date unless set by hand", async () => {
    const { api, user } = await setup()
    await openForm(user)
    await user.type(screen.getByLabelText("Label (optional)"), " Retention ")
    await user.type(screen.getByLabelText("Grant date"), "2024-03-01")
    expect(screen.getByLabelText("Vesting starts")).toHaveValue("2024-03-01") // follows the grant date
    await user.type(screen.getByLabelText("Options"), "1200")
    await user.type(screen.getByLabelText("Strike price"), "3.5")
    await user.click(screen.getByRole("button", { name: "Add grant" }))
    await waitFor(() => expect(api.calls("POST", "/equity/eq1/grants")).toHaveLength(1))
    expect(api.calls("POST", "/equity/eq1/grants")[0].body).toEqual({
      label: "Retention", grantDate: "2024-03-01", options: "1200", strikePrice: "3.5", vestingType: "time", vestStart: "2024-03-01", cliffMonths: 12, vestMonths: 48,
    })
  })

  test("an exit-only grant hides the schedule and sends none", async () => {
    const { api, user } = await setup()
    await openForm(user)
    expect(screen.getByLabelText("Cliff (months)")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "On exit" }))
    expect(screen.queryByLabelText("Cliff (months)")).not.toBeInTheDocument()
    expect(screen.getByText(/do not count in your net worth/)).toBeInTheDocument()
    await user.type(screen.getByLabelText("Grant date"), "2024-03-01")
    await user.type(screen.getByLabelText("Options"), "500")
    await user.type(screen.getByLabelText("Strike price"), "2")
    await user.click(screen.getByRole("button", { name: "Add grant" }))
    await waitFor(() => expect(api.calls("POST", "/equity/eq1/grants")).toHaveLength(1))
    expect(api.calls("POST", "/equity/eq1/grants")[0].body).toEqual({ grantDate: "2024-03-01", options: "500", strikePrice: "2", vestingType: "exit" })
  })

  test("a cliff longer than the vesting period, or zero options, is explained and nothing is sent", async () => {
    const { api, user } = await setup()
    await openForm(user)
    await user.type(screen.getByLabelText("Grant date"), "2024-03-01")
    await user.type(screen.getByLabelText("Options"), "0")
    await user.type(screen.getByLabelText("Strike price"), "1")
    await user.clear(screen.getByLabelText("Fully vested after (months)"))
    await user.type(screen.getByLabelText("Fully vested after (months)"), "6")
    await user.click(screen.getByRole("button", { name: "Add grant" }))
    expect(await screen.findByText("options must be greater than 0")).toBeInTheDocument()
    expect(screen.getByText("cliffMonths cannot be longer than vestMonths")).toBeInTheDocument() // the default 12-month cliff
    expect(api.calls("POST")).toHaveLength(0)
  })

  test("a grant can be edited (prefilled) and deleted after confirming", async () => {
    const { api, user } = await setup()
    await user.click(await screen.findByRole("button", { name: "Edit 2023 grant" }))
    expect(screen.getByLabelText("Options")).toHaveValue(4800)
    expect(screen.getByLabelText("Cliff (months)")).toHaveValue(12)
    await user.clear(screen.getByLabelText("Options"))
    await user.type(screen.getByLabelText("Options"), "9600")
    await user.click(screen.getByRole("button", { name: "Save grant" }))
    await waitFor(() => expect(api.calls("PATCH", "/equity/eq1/grants/g1")).toHaveLength(1))
    expect(api.calls("PATCH", "/equity/eq1/grants/g1")[0].body).toMatchObject({ options: "9600", vestingType: "time", cliffMonths: 12, vestMonths: 48, label: "2023 grant" })

    const row = (await screen.findByText("Exit tranche")).closest("tr")!
    await user.click(within(row).getByRole("button", { name: "Delete" }))
    expect(screen.getByText("Delete Exit tranche?")).toBeInTheDocument()
    expect(api.calls("DELETE")).toHaveLength(0)
    await user.click(screen.getByRole("button", { name: "Yes" }))
    await waitFor(() => expect(api.calls("DELETE", "/equity/eq1/grants/g2")).toHaveLength(1))
  })
})

describe("Options page: share prices", () => {
  test("the prices are charted as a step line and listed newest first with the current one marked", async () => {
    await setup()
    const c = await card()
    expect(c.getByRole("img", { name: "Acme BV share price over time" })).toBeInTheDocument()
    const rows = c.getAllByRole("row").filter((r) => r.textContent?.includes("Series A") || r.textContent?.includes("Seed"))
    expect(rows[0]).toHaveTextContent("Series A")
    expect(rows[0]).toHaveTextContent("current")
    expect(rows[1]).toHaveTextContent("Seed")
  })

  test("adding a price sends the date, price and note; zero is rejected", async () => {
    const { api, user } = await setup()
    await user.click(await screen.findByRole("button", { name: "+ Add price" }))
    expect(screen.getByLabelText("Date")).toHaveValue(today())
    await user.type(screen.getByLabelText(/Price per share/), "0")
    await user.click(screen.getByRole("button", { name: "Save price" }))
    expect(await screen.findByText("price must be greater than 0")).toBeInTheDocument()
    expect(api.calls("POST")).toHaveLength(0)
    await user.clear(screen.getByLabelText(/Price per share/))
    await user.type(screen.getByLabelText(/Price per share/), "15.5")
    await user.type(screen.getByLabelText("Note (optional)"), " Series B ")
    await user.click(screen.getByRole("button", { name: "Save price" }))
    await waitFor(() => expect(api.calls("POST", "/equity/eq1/prices")).toHaveLength(1))
    expect(api.calls("POST", "/equity/eq1/prices")[0].body).toEqual({ priceDate: today(), price: "15.5", note: "Series B" })
  })

  test("a price can be deleted", async () => {
    const { api, user } = await setup()
    await user.click(await screen.findByRole("button", { name: /Delete the price of .*2023/ }))
    await waitFor(() => expect(api.calls("DELETE", "/equity/eq1/prices/p1")).toHaveLength(1))
  })

  test("a future price is marked upcoming", async () => {
    const plan = equityPlan()
    plan.prices = [...plan.prices, { id: "p3", planId: "eq1", priceDate: "2099-01-01", price: "99.000000", note: null, createdAt: "" }]
    await setup([plan])
    expect((await card()).getByText("upcoming")).toBeInTheDocument()
  })
})

describe("Options page: companies and access", () => {
  test("a company is added with a name and currency", async () => {
    const { api, user } = await setup([])
    await user.click(await screen.findByRole("button", { name: "+ New company" }))
    expect(screen.getByRole("button", { name: "Add company" })).toBeDisabled()
    await user.type(screen.getByLabelText("Company"), "Acme BV")
    await user.click(screen.getByRole("button", { name: "USD" }))
    await user.click(screen.getByRole("button", { name: "Add company" }))
    await waitFor(() => expect(api.calls("POST", "/equity")).toHaveLength(1))
    expect(api.calls("POST", "/equity")[0].body).toEqual({ name: "Acme BV", currency: "USD" })
  })

  test("renaming sends the new name", async () => {
    const { api, user } = await setup()
    await user.click(await screen.findByRole("button", { name: "Rename" }))
    await user.clear(screen.getByLabelText("Company"))
    await user.type(screen.getByLabelText("Company"), "Acme Holding")
    await user.click(screen.getByRole("button", { name: "Save" }))
    await waitFor(() => expect(api.calls("PATCH", "/equity/eq1")).toHaveLength(1))
    expect(api.calls("PATCH", "/equity/eq1")[0].body).toEqual({ name: "Acme Holding" })
  })

  test("a viewer sees everything but can change nothing", async () => {
    await setup([equityPlan({ isOwner: false, canEdit: false })])
    await card()
    for (const name of ["Rename", "+ Add grant", "+ Add price", "Share", "Delete company", "Edit 2023 grant", /Delete the price/]) {
      expect(screen.queryByRole("button", { name })).not.toBeInTheDocument()
    }
    expect(screen.getAllByText("€24.000,00").length).toBeGreaterThan(0)
  })

  test("an editor can add grants but not share or delete the company", async () => {
    await setup([equityPlan({ isOwner: false, canEdit: true })])
    expect(await screen.findByRole("button", { name: "+ Add grant" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Share" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Delete company" })).not.toBeInTheDocument()
  })

  test("the owner can share it, and delete it after confirming", async () => {
    const { api, user } = await setup([equityPlan({ members: [{ groupName: "family", role: "viewer" }] })])
    await user.click(await screen.findByRole("button", { name: "Share" }))
    expect(screen.getByText("family")).toBeInTheDocument()
    await user.type(screen.getByPlaceholderText("e.g. family"), "friends")
    await user.click(screen.getByRole("button", { name: "+ Add" }))
    await waitFor(() => expect(api.calls("POST", "/equity/eq1/members")).toHaveLength(1))
    await user.click(screen.getByRole("button", { name: "Delete company" }))
    expect(screen.getByText("Delete company and its grants?")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Yes" }))
    await waitFor(() => expect(api.calls("DELETE", "/equity/eq1")).toHaveLength(1))
  })
})
