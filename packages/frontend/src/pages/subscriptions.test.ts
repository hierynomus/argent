import { describe, expect, test } from "vitest"
import { mockApi, respond } from "../../test/fakeApi"
import { account, subscription } from "../../test/fixtures"
import { renderApp, screen, waitFor, within } from "../../test/render"
import SubscriptionsPage from "./Subscriptions.vue"

const UUID_ACCOUNT = "123e4567-e89b-42d3-a456-426614174000"
const gym = subscription({ id: "s-gym", status: "confirmed", name: "Gym", counterpartyName: "FitCo", counterpartyIban: "NL00FITC0000000001", medianAmount: "29.99", intervalLabel: "monthly", nextExpectedDate: "2024-07-15", transactionCount: 6 })
const candidate = subscription({ id: "s-cand", status: "candidate", name: null, counterpartyName: "Streamly", counterpartyIban: "NL00STRM0000000001", medianAmount: "9.99", transactionCount: 4 })

const setup = async (subs = [gym, candidate], extra: Record<string, any> = {}) => {
  const api = mockApi({
    "GET /subscriptions": subs,
    "GET /accounts": [account({ id: UUID_ACCOUNT, name: "Everyday" })],
    "PATCH /subscriptions/:id": ({ params, body }: any) => ({ ...subs.find((s) => s.id === params.id), ...body }),
    "DELETE /subscriptions/:id": respond(204),
    "POST /subscriptions": ({ body }: any) => ({ id: "new", ...body }),
    "POST /subscriptions/detect": { detected: 0 },
    "GET /subscriptions/:id/transactions": [
      { id: "t1", bookingDate: "2024-06-01", amount: "29.99", currency: "EUR", creditDebitIndicator: "DBIT", description: "June fee" },
      { id: "t2", bookingDate: "2024-05-01", amount: "29.99", currency: "EUR", creditDebitIndicator: "DBIT", description: null },
    ],
    ...extra,
  })
  return { api, ...(await renderApp(SubscriptionsPage)) }
}

describe("confirmed subscriptions", () => {
  test("each row shows its name, IBAN, amount (Dutch format), interval, next date, status and payment count", async () => {
    await setup()
    expect(await screen.findByText("Gym")).toBeInTheDocument()
    expect(screen.getByText("NL00FITC0000000001")).toBeInTheDocument()
    expect(screen.getByText(/29,99/)).toBeInTheDocument()
    expect(screen.getByText("monthly")).toBeInTheDocument()
    expect(screen.getByText("2024-07-15")).toBeInTheDocument()
    expect(screen.getByText("active")).toBeInTheDocument()
    expect(screen.getByText("6 tx")).toBeInTheDocument()
  })

  test("falls back to the counterparty name, then the IBAN, when there is no name", async () => {
    await setup([{ ...gym, name: null }, { ...gym, id: "b", name: null, counterpartyName: null, counterpartyIban: "NL00ONLY0000000001" }])
    expect(await screen.findByText("FitCo")).toBeInTheDocument()
    expect(screen.getAllByText("NL00ONLY0000000001").length).toBeGreaterThan(0)
  })

  test("expanding a row loads and lists its payments; collapsing hides them", async () => {
    const { api, user } = await setup()
    expect(api.calls("GET", "/subscriptions/s-gym/transactions")).toHaveLength(0) // not fetched until needed
    await user.click(await screen.findByText("Gym"))
    expect(await screen.findByText("June fee")).toBeInTheDocument()
    expect(screen.getAllByText(/29,99/).length).toBeGreaterThan(1)
    expect(api.calls("GET", "/subscriptions/s-gym/transactions")).toHaveLength(1)
    await user.click(screen.getByText("Gym"))
    expect(screen.queryByText("June fee")).not.toBeInTheDocument()
  })

  test("a subscription without linked payments says so", async () => {
    const { user } = await setup([gym], { "GET /subscriptions/:id/transactions": [] })
    await user.click(await screen.findByText("Gym"))
    expect(await screen.findByText("No linked transactions.")).toBeInTheDocument()
  })

  test("rename: edit, type, Save", async () => {
    const { api, user } = await setup()
    await user.click(await screen.findByRole("button", { name: "Rename" }))
    const input = screen.getByLabelText("Subscription name")
    expect(input).toHaveValue("Gym")
    await user.clear(input)
    await user.type(input, "Fitness")
    await user.click(screen.getByRole("button", { name: "Save" }))
    await waitFor(() => expect(api.calls("PATCH", "/subscriptions/s-gym")).toHaveLength(1))
    expect(api.calls("PATCH", "/subscriptions/s-gym")[0].body).toEqual({ name: "Fitness" })
    await waitFor(() => expect(screen.queryByLabelText("Subscription name")).not.toBeInTheDocument())
  })

  test("rename: Enter saves and Escape cancels without a request", async () => {
    const { api, user } = await setup()
    await user.click(await screen.findByRole("button", { name: "Rename" }))
    await user.type(screen.getByLabelText("Subscription name"), "x{Escape}")
    expect(screen.queryByLabelText("Subscription name")).not.toBeInTheDocument()
    expect(api.calls("PATCH")).toHaveLength(0)
    await user.click(screen.getByRole("button", { name: "Rename" }))
    await user.type(screen.getByLabelText("Subscription name"), "!{Enter}")
    await waitFor(() => expect(api.calls("PATCH")).toHaveLength(1))
  })

  test("typing in the rename box does not expand the row", async () => {
    const { user } = await setup()
    await user.click(await screen.findByRole("button", { name: "Rename" }))
    await user.click(screen.getByLabelText("Subscription name"))
    expect(screen.queryByText("June fee")).not.toBeInTheDocument()
  })

  test("deactivate and re-activate", async () => {
    const { api, user } = await setup()
    await user.click(await screen.findByRole("button", { name: "Deactivate" }))
    await waitFor(() => expect(api.calls("PATCH", "/subscriptions/s-gym")).toHaveLength(1))
    expect(api.calls("PATCH", "/subscriptions/s-gym")[0].body).toEqual({ isActive: false })
  })

  test("inactive subscriptions can be activated", async () => {
    const { api, user } = await setup([{ ...gym, isActive: false }])
    expect(await screen.findByText("inactive")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Activate" }))
    await waitFor(() => expect(api.calls("PATCH")).toHaveLength(1))
    expect(api.calls("PATCH")[0].body).toEqual({ isActive: true })
  })

  test("delete asks for confirmation inline (no browser dialog), and No backs out", async () => {
    const { api, user } = await setup()
    await user.click(await screen.findByRole("button", { name: "Delete" }))
    expect(screen.getByText("Delete subscription for FitCo?")).toBeInTheDocument()
    expect(api.calls("DELETE")).toHaveLength(0)
    await user.click(screen.getByRole("button", { name: "No" }))
    expect(api.calls("DELETE")).toHaveLength(0)
    await user.click(screen.getByRole("button", { name: "Delete" }))
    await user.click(screen.getByRole("button", { name: "Yes" }))
    await waitFor(() => expect(api.calls("DELETE", "/subscriptions/s-gym")).toHaveLength(1))
  })

  test("action buttons do not toggle the row's expansion", async () => {
    const { user } = await setup()
    await user.click(await screen.findByRole("button", { name: "Deactivate" }))
    expect(screen.queryByText("June fee")).not.toBeInTheDocument()
  })

  test("failed actions show the server's message", async () => {
    const { user } = await setup([gym], { "PATCH /subscriptions/:id": respond(404, { error: "Not found" }) })
    await user.click(await screen.findByRole("button", { name: "Deactivate" }))
    expect(await screen.findByText("Not found")).toBeInTheDocument()
  })

  test("with none, it points to the discovered suggestions (singular/plural) or explains how to add one", async () => {
    const { unmount } = await setup([candidate])
    expect(await screen.findByText("No confirmed subscriptions yet.")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /1 suggestion waiting in Discovered/ })).toBeInTheDocument()
    unmount()
    const two = await setup([candidate, { ...candidate, id: "c2" }])
    expect(await screen.findByRole("button", { name: /2 suggestions waiting in Discovered/ })).toBeInTheDocument()
    two.unmount()
    await setup([])
    expect(await screen.findByText(/Import transactions and use the Discovered tab/)).toBeInTheDocument()
  })
})

describe("discovered candidates", () => {
  const openDiscovered = async (user: any) => user.click(await screen.findByRole("button", { name: /Discovered/ }))

  test("the tab shows how many are waiting", async () => {
    await setup([candidate, { ...candidate, id: "c2" }, gym])
    expect(await screen.findByRole("button", { name: /Discovered\s*2/ })).toBeInTheDocument()
  })

  test("a candidate shows its amount, interval and payment count", async () => {
    const { user } = await setup([{ ...candidate, intervalLabel: "monthly" }])
    await openDiscovered(user)
    expect(await screen.findByText("Streamly")).toBeInTheDocument()
    expect(screen.getByText(/9,99/)).toBeInTheDocument()
    expect(screen.getByText("monthly")).toBeInTheDocument()
    expect(screen.getByText("4 transactions")).toBeInTheDocument()
  })

  test("Confirm and Dismiss send the status", async () => {
    const { api, user } = await setup([candidate])
    await openDiscovered(user)
    await user.click(await screen.findByRole("button", { name: "Confirm" }))
    await waitFor(() => expect(api.calls("PATCH", "/subscriptions/s-cand")).toHaveLength(1))
    expect(api.calls("PATCH", "/subscriptions/s-cand")[0].body).toEqual({ status: "confirmed" })
    await user.click(screen.getByRole("button", { name: "Dismiss" }))
    await waitFor(() => expect(api.calls("PATCH", "/subscriptions/s-cand")).toHaveLength(2))
    expect(api.calls("PATCH", "/subscriptions/s-cand")[1].body).toEqual({ status: "dismissed" })
  })

  test("after confirming, the list is refreshed from the server", async () => {
    const { api, user } = await setup([candidate])
    await openDiscovered(user)
    const before = api.calls("GET", "/subscriptions").length
    await user.click(await screen.findByRole("button", { name: "Confirm" }))
    await waitFor(() => expect(api.calls("GET", "/subscriptions").length).toBeGreaterThan(before))
  })

  test("expanding shows the payments it was detected from", async () => {
    const { user } = await setup([candidate])
    await openDiscovered(user)
    await user.click(await screen.findByText("Streamly"))
    expect(await screen.findByText("June fee")).toBeInTheDocument()
  })

  test("a failed decision is reported", async () => {
    const { user } = await setup([candidate], { "PATCH /subscriptions/:id": respond(403, { error: "Forbidden" }) })
    await openDiscovered(user)
    await user.click(await screen.findByRole("button", { name: "Confirm" }))
    expect(await screen.findByText("Forbidden")).toBeInTheDocument()
  })

  test("with no candidates it explains how to find some", async () => {
    const { user } = await setup([gym])
    await openDiscovered(user)
    expect(await screen.findByText(/No suggestions found/)).toBeInTheDocument()
  })

  test("Run Detection: new patterns refresh the list; none found shows a message (not a browser alert)", async () => {
    const { api, user } = await setup([gym], { "POST /subscriptions/detect": { detected: 0 } })
    await openDiscovered(user)
    await user.click(screen.getByRole("button", { name: "Run Detection" }))
    expect(await screen.findByRole("status")).toHaveTextContent("No new recurring patterns found.")
    expect(api.calls("POST", "/subscriptions/detect")).toHaveLength(1)
  })

  test("Run Detection with a result switches to the Discovered tab and refreshes", async () => {
    const { api, user } = await setup([gym], { "POST /subscriptions/detect": { detected: 2 } })
    await openDiscovered(user)
    const before = api.calls("GET", "/subscriptions").length
    await user.click(screen.getByRole("button", { name: "Run Detection" }))
    await waitFor(() => expect(api.calls("GET", "/subscriptions").length).toBeGreaterThan(before))
    expect(screen.queryByRole("status")).not.toBeInTheDocument()
  })

  test("the page-level actions depend on the tab (+ Add vs Run Detection)", async () => {
    const { user } = await setup()
    expect(await screen.findByRole("button", { name: "+ Add" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Run Detection" })).not.toBeInTheDocument()
    await openDiscovered(user)
    expect(screen.queryByRole("button", { name: "+ Add" })).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Run Detection" })).toBeInTheDocument()
  })
})

describe("adding a subscription by hand", () => {
  const open = async (user: any) => user.click(await screen.findByRole("button", { name: "+ Add" }))

  test("creates it for the chosen account, trimming the IBAN and label", async () => {
    const { api, user } = await setup()
    await open(user)
    await user.type(screen.getByLabelText("Counterparty IBAN"), "  NL00NEWW0000000001 ")
    await user.type(screen.getByLabelText("Label (optional)"), " Netflix ")
    await user.click(screen.getByRole("button", { name: "Add" }))
    await waitFor(() => expect(api.calls("POST", "/subscriptions")).toHaveLength(1))
    expect(api.calls("POST", "/subscriptions")[0].body).toEqual({ accountId: UUID_ACCOUNT, counterpartyIban: "NL00NEWW0000000001", name: "Netflix" })
    await waitFor(() => expect(screen.queryByLabelText("Counterparty IBAN")).not.toBeInTheDocument()) // form closes
  })

  test("the label is optional", async () => {
    const { api, user } = await setup()
    await open(user)
    await user.type(screen.getByLabelText("Counterparty IBAN"), "NL00NEWW0000000001")
    await user.click(screen.getByRole("button", { name: "Add" }))
    await waitFor(() => expect(api.calls("POST")).toHaveLength(1))
    expect(api.calls("POST")[0].body.name).toBeUndefined()
  })

  test("Add stays disabled until an IBAN is entered", async () => {
    const { user } = await setup()
    await open(user)
    expect(screen.getByRole("button", { name: "Add" })).toBeDisabled()
    await user.type(screen.getByLabelText("Counterparty IBAN"), "   ")
    expect(screen.getByRole("button", { name: "Add" })).toBeDisabled()
  })

  test("the account choices come from the user's accounts", async () => {
    const { user } = await setup()
    await open(user)
    const select = screen.getByLabelText("Account")
    expect(within(select).getByRole("option", { name: "Everyday" })).toBeInTheDocument()
  })

  test("Cancel closes the form; '+ Add' toggles it", async () => {
    const { user } = await setup()
    await open(user)
    expect(screen.getByLabelText("Counterparty IBAN")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Cancel" }))
    expect(screen.queryByLabelText("Counterparty IBAN")).not.toBeInTheDocument()
    await open(user)
    await user.click(screen.getByRole("button", { name: "+ Add" }))
    expect(screen.queryByLabelText("Counterparty IBAN")).not.toBeInTheDocument()
  })

  test("a server rejection (e.g. already exists) is shown and the form stays open", async () => {
    const { user } = await setup(undefined, { "POST /subscriptions": respond(409, { error: "A subscription for this account + IBAN already exists" }) })
    await open(user)
    await user.type(screen.getByLabelText("Counterparty IBAN"), "NL00NEWW0000000001")
    await user.click(screen.getByRole("button", { name: "Add" }))
    expect(await screen.findByText("A subscription for this account + IBAN already exists")).toBeInTheDocument()
    expect(screen.getByLabelText("Counterparty IBAN")).toHaveValue("NL00NEWW0000000001")
  })
})
