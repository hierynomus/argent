import { describe, expect, test } from "vitest"
import { mockApi, respond } from "../../test/fakeApi"
import { debt, property } from "../../test/fixtures"
import { renderApp, screen, waitFor, within } from "../../test/render"
import PropertyPage from "./Property.vue"

const today = () => new Date().toISOString().slice(0, 10)

const setup = async (list: any[] = [property()], extra: Record<string, any> = {}) => {
  const api = mockApi({
    "GET /properties": list,
    "GET /mortgages": [debt({ id: "d1", name: "House" })],
    "GET /loans": [debt({ id: "l1", name: "Car" })],
    "POST /properties": ({ body }: any) => ({ ...property({ id: "new" }), ...body }),
    "PATCH /properties/:id": ({ body }: any) => ({ ...property(), ...body }),
    "DELETE /properties/:id": respond(204),
    "POST /properties/:id/valuations": ({ body }: any) => ({ id: "nv", ...body }),
    "DELETE /properties/:id/valuations/:vid": respond(204),
    "PUT /properties/:id/links": property(),
    "POST /properties/:id/members": ({ body }: any) => body,
    "DELETE /properties/:id/members/:group": respond(204),
    ...extra,
  })
  return { api, ...(await renderApp(PropertyPage)) }
}
const card = () => screen.getByRole("region", { name: "Our house" })

describe("Property page: the overview", () => {
  test("a property shows its value, what is owed, the equity and the gain since purchase", async () => {
    await setup()
    await screen.findByRole("heading", { name: "Our house" })
    const c = within(card())
    expect(c.getByText("€ 520.000,00", { selector: "dd" })).toBeInTheDocument() // worth
    expect(c.getByText(/as of .*2024/)).toBeInTheDocument()
    expect(c.getByText("€ 300.000,00", { selector: "dd" })).toBeInTheDocument() // owed
    expect(c.getByText("€ 220.000,00", { selector: "dd" })).toBeInTheDocument() // equity
    expect(c.getByText("+€ 120.000,00", { selector: "dd" })).toBeInTheDocument() // since purchase
    expect(c.getByText(/bought for € 400\.000,00 in .*2021 \(\+30,0%\)/)).toBeInTheDocument()
  })

  test("the linked mortgage or loan is listed with its balance and monthly payment", async () => {
    await setup([property({ liabilities: [{ kind: "mortgage", id: "d1", name: "House mortgage", balance: 300000, monthlyPayment: 1500 }, { kind: "loan", id: "l1", name: "Renovation", balance: 20000, monthlyPayment: 400 }], debt: 320000, equity: 200000 })])
    const c = within(await screen.findByRole("region", { name: "Our house" }))
    expect(c.getByText("House mortgage")).toBeInTheDocument()
    expect(c.getByText("Renovation")).toBeInTheDocument()
    expect(c.getByText(/€ 1\.500,00\/mo/)).toBeInTheDocument()
    expect(c.getByText("2 mortgages/loans")).toBeInTheDocument()
  })

  test("without a link it says so; without a valuation or purchase the value is unknown", async () => {
    await setup([property({ liabilities: [], debt: 0, valuations: [], currentValue: null, currentValueDate: null, gainSincePurchase: null, equity: null, purchasePrice: null, purchaseDate: null })])
    const c = within(await screen.findByRole("region", { name: "Our house" }))
    expect(c.getByText("No mortgage or loan linked.")).toBeInTheDocument()
    expect(c.getByText("no valuation yet")).toBeInTheDocument()
    expect(c.getByText("no purchase price")).toBeInTheDocument()
    expect(c.getByText("No valuations yet.", { exact: false })).toBeInTheDocument()
    expect(c.getAllByText("—").length).toBeGreaterThanOrEqual(3)
  })

  test("negative equity is shown in red", async () => {
    await setup([property({ debt: 600000, equity: -80000 })])
    expect((await screen.findByText(/80\.000,00/, { selector: "dd.text-xl" })).className).toContain("text-red-600")
  })

  test("totals are shown per currency and never mixed", async () => {
    await setup([property(), property({ id: "pr2", name: "Cabin", currency: "USD", currentValue: 100000, debt: 0, equity: 100000, liabilities: [], purchasePrice: null, gainSincePurchase: null })])
    const eur = await screen.findByRole("region", { name: "EUR totals" })
    const usd = screen.getByRole("region", { name: "USD totals" })
    expect(within(eur).getByText("€520.000,00", { selector: "p" })).toBeInTheDocument()
    expect(within(eur).getByText("€220.000,00", { selector: "p" })).toBeInTheDocument()
    expect(within(usd).getAllByText("$100.000,00", { selector: "p" })).toHaveLength(2) // worth and equity
  })

  test("with no property it explains what to do and offers to add one", async () => {
    await setup([])
    expect(await screen.findByText("No property yet.")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "+ New property" })).toBeInTheDocument()
  })
})

describe("Property page: valuations", () => {
  test("the valuations are listed newest first, the current one marked, and charted as a step line", async () => {
    await setup()
    const c = within(await screen.findByRole("region", { name: "Our house" }))
    const rows = c.getAllByRole("row").slice(1)
    expect(rows[0]).toHaveTextContent("€ 520.000,00")
    expect(rows[0]).toHaveTextContent("WOZ 2024")
    expect(rows[0]).toHaveTextContent("current")
    expect(rows[1]).toHaveTextContent("€ 400.000,00")
    expect(rows[1]).not.toHaveTextContent("current")
    expect(c.getByRole("img", { name: "Our house value over time" })).toBeInTheDocument()
  })

  test("a valuation dated in the future is marked upcoming", async () => {
    await setup([property({ valuations: [...property().valuations, { id: "v3", propertyId: "pr1", valuationDate: "2099-01-01", value: "900000.00", note: null, createdAt: "" }] })])
    const c = within(await screen.findByRole("region", { name: "Our house" }))
    expect(c.getByText("upcoming")).toBeInTheDocument()
  })

  test("adding a valuation sends the date, value and note", async () => {
    const { api, user } = await setup()
    await user.click(await screen.findByRole("button", { name: "+ Add valuation" }))
    expect(screen.getByLabelText("Date")).toHaveValue(today())
    await user.type(screen.getByLabelText(/^Value/), "540000")
    await user.type(screen.getByLabelText("Note (optional)"), " My estimate ")
    await user.click(screen.getByRole("button", { name: "Save valuation" }))
    await waitFor(() => expect(api.calls("POST", "/properties/pr1/valuations")).toHaveLength(1))
    expect(api.calls("POST", "/properties/pr1/valuations")[0].body).toEqual({ valuationDate: today(), value: "540000", note: "My estimate" })
    await waitFor(() => expect(screen.queryByRole("button", { name: "Save valuation" })).not.toBeInTheDocument()) // form closes
  })

  test("a zero value is explained and nothing is sent", async () => {
    const { api, user } = await setup()
    await user.click(await screen.findByRole("button", { name: "+ Add valuation" }))
    await user.type(screen.getByLabelText(/^Value/), "0")
    await user.click(screen.getByRole("button", { name: "Save valuation" }))
    expect(await screen.findByText("value must be greater than 0")).toBeInTheDocument()
    expect(api.calls("POST")).toHaveLength(0)
  })

  test("a valuation can be deleted", async () => {
    const { api, user } = await setup()
    await user.click(await screen.findByRole("button", { name: /Delete the valuation of .*2024/ }))
    await waitFor(() => expect(api.calls("DELETE", "/properties/pr1/valuations/v2")).toHaveLength(1))
  })
})

describe("Property page: creating and editing", () => {
  test("creates a property with a purchase and today's value; empty fields are left out", async () => {
    const { api, user } = await setup([])
    await user.click(await screen.findByRole("button", { name: "+ New property" }))
    await user.type(screen.getByLabelText("Name"), "Holiday flat")
    await user.selectOptions(screen.getByLabelText("Type"), "apartment")
    await user.click(screen.getByRole("button", { name: "USD" }))
    await user.type(screen.getByLabelText(/Purchase price/), "250000")
    await user.type(screen.getByLabelText("Worth today (optional)"), "300000")
    await user.click(screen.getByRole("button", { name: "Add property" }))
    await waitFor(() => expect(api.calls("POST", "/properties")).toHaveLength(1))
    expect(api.calls("POST", "/properties")[0].body).toEqual({ name: "Holiday flat", type: "apartment", currency: "USD", purchasePrice: "250000", currentValue: "300000" })
  })

  test("the add button waits for a name, and a bad purchase price is explained", async () => {
    const { api, user } = await setup([])
    await user.click(await screen.findByRole("button", { name: "+ New property" }))
    expect(screen.getByRole("button", { name: "Add property" })).toBeDisabled()
    await user.type(screen.getByLabelText("Name"), "X")
    await user.type(screen.getByLabelText(/Purchase price/), "-5")
    await user.click(screen.getByRole("button", { name: "Add property" }))
    expect(await screen.findByText("purchasePrice must be greater than 0")).toBeInTheDocument()
    expect(api.calls("POST")).toHaveLength(0)
  })

  test("Cancel closes the form", async () => {
    const { user } = await setup([])
    await user.click(await screen.findByRole("button", { name: "+ New property" }))
    await user.click(screen.getByRole("button", { name: "Cancel" }))
    expect(screen.queryByLabelText("Name")).not.toBeInTheDocument()
  })

  test("editing shows the current values; an emptied purchase price is sent as null", async () => {
    const { api, user } = await setup()
    await user.click(await screen.findByRole("button", { name: "Edit" }))
    expect(screen.getByLabelText("Name")).toHaveValue("Our house")
    expect(screen.getByLabelText("Purchase price")).toHaveValue(400000)
    await user.clear(screen.getByLabelText("Name"))
    await user.type(screen.getByLabelText("Name"), "Home")
    await user.clear(screen.getByLabelText("Purchase price"))
    await user.click(screen.getByRole("button", { name: "Save" }))
    await waitFor(() => expect(api.calls("PATCH", "/properties/pr1")).toHaveLength(1))
    expect(api.calls("PATCH", "/properties/pr1")[0].body).toEqual({ name: "Home", type: "house", purchasePrice: null, purchaseDate: "2021-03-01" })
  })

  test("server errors are shown", async () => {
    const { user } = await setup([], { "POST /properties": respond(400, { error: "Something is wrong" }) })
    await user.click(await screen.findByRole("button", { name: "+ New property" }))
    await user.type(screen.getByLabelText("Name"), "X")
    await user.click(screen.getByRole("button", { name: "Add property" }))
    expect(await screen.findByText("Something is wrong")).toBeInTheDocument()
  })
})

describe("Property page: linking a mortgage or loan", () => {
  test("the mortgages and loans are offered with what they owe; the linked one is ticked", async () => {
    const { user } = await setup()
    await user.click(await screen.findByRole("button", { name: "Link mortgage / loan" }))
    const mortgage = screen.getByRole("checkbox", { name: /House mortgage · owed/ })
    expect(mortgage).toBeChecked()
    expect(screen.getByRole("checkbox", { name: /Car loan · owed/ })).not.toBeChecked()
  })

  test("saving sends the chosen ids", async () => {
    const { api, user } = await setup()
    await user.click(await screen.findByRole("button", { name: "Link mortgage / loan" }))
    await user.click(screen.getByRole("checkbox", { name: /Car loan/ }))
    await user.click(screen.getByRole("button", { name: "Save links" }))
    await waitFor(() => expect(api.calls("PUT", "/properties/pr1/links")).toHaveLength(1))
    expect(api.calls("PUT", "/properties/pr1/links")[0].body).toEqual({ mortgageIds: ["d1"], loanIds: ["l1"] })
  })

  test("unticking everything unlinks", async () => {
    const { api, user } = await setup()
    await user.click(await screen.findByRole("button", { name: "Link mortgage / loan" }))
    await user.click(screen.getByRole("checkbox", { name: /House mortgage/ }))
    await user.click(screen.getByRole("button", { name: "Save links" }))
    await waitFor(() => expect(api.calls("PUT", "/properties/pr1/links")[0].body).toEqual({ mortgageIds: [], loanIds: [] }))
  })

  test("with no mortgages or loans it points to where to add them", async () => {
    const { user } = await setup([property()], { "GET /mortgages": [], "GET /loans": [] })
    await user.click(await screen.findByRole("button", { name: "Link mortgage / loan" }))
    expect(await screen.findByText(/no mortgages or loans to link yet/)).toBeInTheDocument()
  })
})

describe("Property page: access", () => {
  test("a viewer sees everything but can change nothing", async () => {
    await setup([property({ isOwner: false, canEdit: false })])
    await screen.findByRole("heading", { name: "Our house" })
    for (const name of ["Edit", "Link mortgage / loan", "+ Add valuation", "Share", "Delete property", /Delete the valuation/]) {
      expect(screen.queryByRole("button", { name })).not.toBeInTheDocument()
    }
    expect(screen.getAllByText("€ 520.000,00").length).toBeGreaterThan(0)
  })

  test("an editor can edit but not share or delete", async () => {
    await setup([property({ isOwner: false, canEdit: true })])
    expect(await screen.findByRole("button", { name: "Edit" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Share" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Delete property" })).not.toBeInTheDocument()
  })

  test("the owner can share it with a group", async () => {
    const { api, user } = await setup([property({ members: [{ groupName: "family", role: "viewer" }] })])
    await user.click(await screen.findByRole("button", { name: "Share" }))
    expect(screen.getByText("family")).toBeInTheDocument()
    await user.type(screen.getByPlaceholderText("e.g. family"), "friends")
    await user.click(screen.getByRole("button", { name: "+ Add" }))
    await waitFor(() => expect(api.calls("POST", "/properties/pr1/members")).toHaveLength(1))
    expect(api.calls("POST", "/properties/pr1/members")[0].body).toMatchObject({ groupName: "friends" })
  })

  test("the owner can delete it after confirming", async () => {
    const { api, user } = await setup()
    await user.click(await screen.findByRole("button", { name: "Delete property" }))
    expect(screen.getByText("Delete property?")).toBeInTheDocument()
    expect(api.calls("DELETE")).toHaveLength(0)
    await user.click(screen.getByRole("button", { name: "Yes" }))
    await waitFor(() => expect(api.calls("DELETE", "/properties/pr1")).toHaveLength(1))
  })
})
