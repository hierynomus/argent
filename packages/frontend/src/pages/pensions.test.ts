import { describe, expect, test } from "vitest"
import { mockApi, respond } from "../../test/fakeApi"
import { pensionPlan, pensionStatement } from "../../test/fixtures"
import { renderApp, screen, waitFor, within } from "../../test/render"
import PensionsPage from "./Pensions.vue"

const old = pensionPlan({
  id: "old", name: "Old employer", kind: "occupational_db", state: "closed", closedOn: "2024-01-01", netWorthValue: 0, capital: null, countInNetWorth: false,
  accruedIncome: 8000, expectedIncome: 8000, incomeLow: null, incomeHigh: null,
  statements: [pensionStatement({ id: "o1", planId: "old", capital: null, accruedIncome: "8000.00" })],
  latestStatement: pensionStatement({ id: "o1", planId: "old", capital: null, accruedIncome: "8000.00" }),
  transfers: [{ id: "t1", fromPlanId: "old", toPlanId: "pn1", fromPlanName: "Old employer", toPlanName: "Employer pension", transferDate: "2024-01-01", kind: "conversion", capital: "40000.00", incomeGivenUp: "6000.00", note: null, createdAt: "2024-01-01T00:00:00Z" }],
})
const current = pensionPlan({
  transfers: [{ ...old.transfers[0] }],
})

const setup = async (list: any[] = [current, old], extra: Record<string, any> = {}) => {
  const api = mockApi({
    "GET /pensions": list,
    "POST /pensions": ({ body }: any) => ({ ...pensionPlan({ id: "new" }), ...body }),
    "PATCH /pensions/:id": ({ body }: any) => ({ ...pensionPlan(), ...body }),
    "DELETE /pensions/:id": respond(204),
    "POST /pensions/:id/statements": pensionPlan(),
    "DELETE /pensions/:id/statements/:sid": respond(204),
    "POST /pensions/transfers": [pensionPlan()],
    "DELETE /pensions/transfers/:tid": respond(204),
    "POST /pensions/:id/members": ({ body }: any) => body,
    "DELETE /pensions/:id/members/:group": respond(204),
    ...extra,
  })
  return { api, ...(await renderApp(PensionsPage)) }
}
const card = async (name = "Employer pension") => within(await screen.findByRole("region", { name }))

describe("Pensions page: the overview", () => {
  test("a pot shows its capital, the projection scenarios and that it counts in net worth", async () => {
    await setup()
    const c = await card()
    expect(c.getByText("€42.000,00", { selector: "dd" })).toBeInTheDocument()
    expect(c.getByText(/as of .*2024 · counts in net worth/)).toBeInTheDocument()
    expect(c.getByText("€22.000,00 / yr", { selector: "dd" })).toBeInTheDocument()
    expect(c.getByText(/€18\.000,00 – €27\.000,00 · today's euros/)).toBeInTheDocument()
    expect(c.getByText("Active")).toBeInTheDocument()
  })

  test("the totals count pots in net worth and add up the expected income of open plans only", async () => {
    await setup()
    const totals = within(await screen.findByRole("region", { name: "EUR totals" }))
    expect(totals.getByText("€42.000,00")).toBeInTheDocument() // pots
    expect(totals.getByText("€22.000,00 / yr")).toBeInTheDocument() // the closed plan's €8.000 is not in it
  })

  test("closed plans are tucked away until asked for, and show how they ended", async () => {
    const { user } = await setup()
    await screen.findByRole("region", { name: "Employer pension" })
    expect(screen.queryByRole("region", { name: "Old employer" })).not.toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: /Show closed plans \(1\)/ }))
    const c = await card("Old employer")
    expect(c.getByText("Closed")).toBeInTheDocument()
    expect(c.getByText(/Converted/)).toBeInTheDocument()
    expect(c.getAllByText("€8.000,00 / yr", { selector: "dd" })).toHaveLength(2) // built up, and the expected income that falls back to it
  })

  test("a conversion is shown on both plans, naming the other one", async () => {
    await setup()
    const c = await card()
    expect(c.getByText(/Converted\s+from/)).toBeInTheDocument()
    expect(c.getByText("Old employer")).toBeInTheDocument()
    expect(c.getByText("€40.000,00")).toBeInTheDocument()
    expect(c.getByText(/€6\.000,00 \/ yr given up/)).toBeInTheDocument()
  })

  test("nominal and today's-euro incomes are not silently added", async () => {
    await setup([current, pensionPlan({ id: "other", name: "Other", incomeInTodaysMoney: false })])
    expect(await screen.findByText(/adds figures in today's euros to nominal ones/)).toBeInTheDocument()
  })

  test("says so when there are no plans", async () => {
    await setup([])
    expect(await screen.findByText("No pensions yet.")).toBeInTheDocument()
  })
})

describe("Pensions page: entering data", () => {
  test("a new plan is created with its type", async () => {
    const { api, user } = await setup([])
    await user.click(await screen.findByRole("button", { name: "+ New plan" }))
    await user.type(screen.getByLabelText("Name"), "My lijfrente")
    await user.selectOptions(screen.getByLabelText("Type"), "personal")
    await user.click(screen.getByRole("button", { name: "Add plan" }))
    await waitFor(() => expect(api.calls("POST", "/pensions")).toHaveLength(1))
    expect(api.calls("POST", "/pensions")[0].body).toMatchObject({ name: "My lijfrente", kind: "personal", currency: "EUR" })
  })

  test("a statement with the three scenarios is sent as entered, and an empty one is refused", async () => {
    const { api, user } = await setup([current])
    await user.click(await screen.findByRole("button", { name: "+ Add statement" }))
    expect(screen.getByRole("button", { name: "Save statement" })).toBeDisabled()
    await user.type(screen.getByLabelText(/Pot \/ capital/), "45000")
    await user.type(screen.getByLabelText(/low/), "19000")
    await user.type(screen.getByLabelText("Expected"), "23000")
    await user.type(screen.getByLabelText("High"), "28000")
    await user.click(screen.getByRole("button", { name: "Save statement" }))
    await waitFor(() => expect(api.calls("POST", "/pensions/pn1/statements")).toHaveLength(1))
    expect(api.calls("POST", "/pensions/pn1/statements")[0].body).toMatchObject({ capital: "45000", projectedLow: "19000", projectedExpected: "23000", projectedHigh: "28000", inTodaysMoney: true })
  })

  test("scenarios out of order are explained, not sent", async () => {
    const { api, user } = await setup([current])
    await user.click(await screen.findByRole("button", { name: "+ Add statement" }))
    await user.type(screen.getByLabelText(/low/), "30000")
    await user.type(screen.getByLabelText("Expected"), "20000")
    await user.click(screen.getByRole("button", { name: "Save statement" }))
    expect(await screen.findByText(/go from low to expected to high/)).toBeInTheDocument()
    expect(api.calls("POST", "/pensions/pn1/statements")).toHaveLength(0)
  })

  test("moving a plan to another records a transfer that closes the old plan by default", async () => {
    // the shared schema wants real ids for the plans
    const [from, to] = ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"]
    const { api, user } = await setup([pensionPlan({ id: from }), pensionPlan({ id: to, name: "New fund" })])
    const c = await card()
    await user.click(c.getByRole("button", { name: "Move to another plan…" }))
    await user.selectOptions(c.getByLabelText("Moves to"), "New fund")
    await user.click(c.getByRole("button", { name: "Conversion" }))
    await user.type(c.getByLabelText(/Value that arrived/), "40000")
    await user.click(c.getByRole("button", { name: "Record transfer" }))
    await waitFor(() => expect(api.calls("POST", "/pensions/transfers")).toHaveLength(1))
    expect(api.calls("POST", "/pensions/transfers")[0].body).toMatchObject({ fromPlanId: from, toPlanId: to, kind: "conversion", capital: "40000", closeFrom: true })
  })

  test("with no other plan, moving explains that the new plan comes first", async () => {
    const { user } = await setup([current])
    const c = await card()
    await user.click(c.getByRole("button", { name: "Move to another plan…" }))
    expect(c.getByText(/Add the plan the value moves to first/)).toBeInTheDocument()
  })

  test("closing, freezing and reopening are plain updates", async () => {
    const { api, user } = await setup([current, old])
    const c = await card()
    await user.click(c.getByRole("button", { name: "Mark as frozen" }))
    await waitFor(() => expect(api.calls("PATCH", "/pensions/pn1")).toHaveLength(1))
    expect(api.calls("PATCH", "/pensions/pn1")[0].body).toEqual({ status: "frozen" })
    await user.click(c.getByRole("button", { name: "Close plan…" }))
    await user.click(c.getByRole("button", { name: "Close plan" }))
    await waitFor(() => expect(api.calls("PATCH", "/pensions/pn1")).toHaveLength(2))
    expect(api.calls("PATCH", "/pensions/pn1")[1].body).toEqual({ closedOn: new Date().toISOString().slice(0, 10) })

    await user.click(screen.getByRole("button", { name: /Show closed plans/ }))
    await user.click(within(await screen.findByRole("region", { name: "Old employer" })).getByRole("button", { name: "Reopen" }))
    await waitFor(() => expect(api.calls("PATCH", "/pensions/old")).toHaveLength(1))
    expect(api.calls("PATCH", "/pensions/old")[0].body).toEqual({ closedOn: null })
  })

  test("whether the pot counts in net worth can be switched", async () => {
    const { api, user } = await setup([current])
    const c = await card()
    await user.click(c.getByLabelText("Count the pot in net worth"))
    await waitFor(() => expect(api.calls("PATCH", "/pensions/pn1")).toHaveLength(1))
    expect(api.calls("PATCH", "/pensions/pn1")[0].body).toEqual({ countInNetWorth: false })
  })
})

describe("Pensions page: permissions", () => {
  test("a viewer sees the plan but none of the controls", async () => {
    await setup([pensionPlan({ canEdit: false, isOwner: false })])
    const c = await card()
    expect(c.getByText("€42.000,00", { selector: "dd" })).toBeInTheDocument()
    for (const name of ["Rename", "+ Add statement", "Close plan…", "Move to another plan…", "Share", "Delete plan"]) expect(c.queryByRole("button", { name })).not.toBeInTheDocument()
  })
})
