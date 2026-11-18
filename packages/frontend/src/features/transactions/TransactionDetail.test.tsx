import { describe, expect, mock, test } from "bun:test"
import { Route, Routes } from "react-router-dom"
import { mockApi, respond } from "../../../test/fakeApi"
import { account, category, transaction } from "../../../test/fixtures"
import { renderApp, screen, waitFor, within } from "../../../test/render"
import { TransactionDetail } from "./TransactionDetail"

const peer = (over: object = {}) => ({ id: "peer1", accountId: "a2", amount: "50.00", currency: "EUR", creditDebitIndicator: "CRDT", bookingDate: "2024-06-02", account: account({ id: "a2", name: "Savings pot" }), ...over })

function setup(tx = transaction(), extra: Record<string, any> = {}, labels = [category({ id: "c1", name: "Groceries" }), category({ id: "c2", name: "Fun" })]) {
  const api = mockApi({
    "GET /transactions/:id/transfer-suggestions": [peer()],
    "POST /transactions/:id/transfer": ({ params, body }: any) => ({ ...tx, id: params.id, transferPeerId: body.peerId }),
    "DELETE /transactions/:id/transfer": respond(204),
    ...extra,
  })
  const onClose = mock(), onLabel = mock(), onTransferChange = mock()
  const utils = renderApp(
    <Routes>
      <Route path="/" element={<TransactionDetail tx={tx} labels={labels} onClose={onClose} onLabel={onLabel} onTransferChange={onTransferChange} />} />
      <Route path="/subscriptions" element={<h1>Subscriptions page</h1>} />
    </Routes>,
  )
  return { api, onClose, onLabel, onTransferChange, ...utils }
}

describe("TransactionDetail: content", () => {
  test("is a labelled dialog with the signed amount", () => {
    setup(transaction({ amount: "12.50", creditDebitIndicator: "DBIT" }))
    expect(screen.getByRole("dialog", { name: "Transaction details" })).toBeInTheDocument()
    expect(screen.getByText(/-12,50/)).toBeInTheDocument()
  })

  test("a credit is shown with a plus sign", () => {
    setup(transaction({ amount: "2000.00", creditDebitIndicator: "CRDT" }))
    expect(screen.getByText(/\+2\.000,00/)).toBeInTheDocument()
  })

  test("lists the booking date, account (name + IBAN), counterparty, description and reference", () => {
    setup(transaction({ bookingDate: "2024-06-01", description: "Coffee beans", reference: "REF-123", counterpartyName: "Roastery", counterpartyIban: "NL00ROAS0000000001", account: account({ name: "Everyday", iban: "NL01CHEK0000000001" }) }))
    expect(screen.getByText("2024-06-01")).toBeInTheDocument()
    expect(screen.getByText("Everyday")).toBeInTheDocument()
    expect(screen.getByText("NL01CHEK0000000001")).toBeInTheDocument()
    expect(screen.getByText("Roastery")).toBeInTheDocument()
    expect(screen.getByText("NL00ROAS0000000001")).toBeInTheDocument()
    expect(screen.getByText("Coffee beans")).toBeInTheDocument()
    expect(screen.getByText("REF-123")).toBeInTheDocument()
  })

  test("the value date only appears when it differs from the booking date", () => {
    const { unmount } = setup(transaction({ bookingDate: "2024-06-01", valueDate: "2024-06-03" }))
    expect(screen.getByText("Value date")).toBeInTheDocument()
    unmount()
    setup(transaction({ bookingDate: "2024-06-01", valueDate: "2024-06-01" }))
    expect(screen.queryByText("Value date")).not.toBeInTheDocument()
  })

  test("an unnamed account shows just its IBAN, and empty fields are left out", () => {
    setup(transaction({ account: account({ name: null, iban: "NL09ONLY0000000001" }), description: null, reference: null, counterpartyName: null }))
    expect(screen.getAllByText("NL09ONLY0000000001")).toHaveLength(1)
    for (const label of ["Description", "Reference", "Counterparty"]) expect(screen.queryByText(label)).not.toBeInTheDocument()
  })

  test("for a linked transfer the counterparty is replaced by the other account", () => {
    setup(transaction({ counterpartyName: "ignored", transferPeerId: "p", transferPeer: { id: "p", accountId: "a2", bookingDate: "2024-06-02", account: account({ id: "a2", name: "Savings pot" }) } as any }))
    expect(screen.queryByText("Counterparty")).not.toBeInTheDocument()
    expect(screen.getByText(/↔ Savings pot/)).toBeInTheDocument()
  })
})

describe("TransactionDetail: closing", () => {
  test("the × button, the backdrop and Escape all close it", async () => {
    const { onClose, user } = setup()
    await user.click(screen.getByRole("button", { name: "Close" }))
    expect(onClose).toHaveBeenCalledTimes(1)
    await user.click(document.querySelector(".fixed.inset-0") as HTMLElement)
    expect(onClose).toHaveBeenCalledTimes(2)
    await user.keyboard("{Escape}")
    expect(onClose).toHaveBeenCalledTimes(3)
  })
})

describe("TransactionDetail: label", () => {
  test("shows the current label and offers all labels plus 'Unlabeled'", () => {
    setup(transaction({ categoryId: "c2" }))
    const select = screen.getByLabelText("Label") as HTMLSelectElement
    expect(select.value).toBe("c2")
    expect(within(select).getAllByRole("option").map((o) => o.textContent)).toEqual(["Unlabeled", "Groceries", "Fun"])
  })

  test("choosing a label reports it; choosing 'Unlabeled' reports null", async () => {
    const { onLabel, user } = setup(transaction({ id: "t9", categoryId: "c2" }))
    await user.selectOptions(screen.getByLabelText("Label"), "c1")
    expect(onLabel).toHaveBeenLastCalledWith("t9", "c1")
    await user.selectOptions(screen.getByLabelText("Label"), "")
    expect(onLabel).toHaveBeenLastCalledWith("t9", null)
  })
})

describe("TransactionDetail: transfers", () => {
  test("suggestions are only requested once the link panel is opened", async () => {
    const { api, user } = setup()
    expect(api.calls("GET", "/transactions/t1/transfer-suggestions")).toHaveLength(0)
    await user.click(screen.getByRole("button", { name: /Link as transfer/ }))
    expect(await screen.findByText("Savings pot")).toBeInTheDocument()
    expect(api.calls("GET", "/transactions/t1/transfer-suggestions")).toHaveLength(1)
    expect(screen.getByText("2024-06-02")).toBeInTheDocument()
    expect(screen.getByText(/\+50,00/)).toBeInTheDocument()
  })

  test("says so when nothing matches", async () => {
    const { user } = setup(transaction(), { "GET /transactions/:id/transfer-suggestions": [] })
    await user.click(screen.getByRole("button", { name: /Link as transfer/ }))
    expect(await screen.findByText("No matching transactions found.")).toBeInTheDocument()
  })

  test("picking a suggestion links it and reports the updated transaction", async () => {
    const { api, onTransferChange, user } = setup()
    await user.click(screen.getByRole("button", { name: /Link as transfer/ }))
    await user.click(await screen.findByRole("button", { name: /Savings pot/ }))
    await waitFor(() => expect(api.calls("POST", "/transactions/t1/transfer")).toHaveLength(1))
    expect(api.calls("POST", "/transactions/t1/transfer")[0].body).toEqual({ peerId: "peer1" })
    await waitFor(() => expect(onTransferChange).toHaveBeenCalledTimes(1))
    expect(onTransferChange.mock.calls[0][0]).toMatchObject({ id: "t1", transferPeerId: "peer1" })
  })

  test("the link panel can be closed again", async () => {
    const { user } = setup()
    await user.click(screen.getByRole("button", { name: /Link as transfer/ }))
    await screen.findByText("Savings pot")
    await user.click(screen.getByRole("button", { name: /Link as transfer/ }))
    expect(screen.queryByText("Savings pot")).not.toBeInTheDocument()
  })

  test("a failed link is explained in the panel", async () => {
    const { user } = setup(transaction(), { "POST /transactions/:id/transfer": respond(409, { error: "One or both transactions are already linked to a transfer" }) })
    await user.click(screen.getByRole("button", { name: /Link as transfer/ }))
    await user.click(await screen.findByRole("button", { name: /Savings pot/ }))
    expect(await screen.findByText(/already linked to a transfer/)).toBeInTheDocument()
  })

  test("unlinking calls the API and reports the transaction without its peer", async () => {
    const linked = transaction({ id: "t1", transferPeerId: "p", transferPeer: { id: "p", accountId: "a2", bookingDate: "2024-06-02", account: account({ id: "a2", name: "Savings pot" }) } as any })
    const { api, onTransferChange, user } = setup(linked)
    await user.click(screen.getByRole("button", { name: "Unlink" }))
    await waitFor(() => expect(api.calls("DELETE", "/transactions/t1/transfer")).toHaveLength(1))
    await waitFor(() => expect(onTransferChange).toHaveBeenCalledTimes(1))
    expect(onTransferChange.mock.calls[0][0]).toMatchObject({ id: "t1", transferPeerId: null, transferPeer: null })
  })

  test("a failed unlink is reported", async () => {
    const linked = transaction({ transferPeerId: "p", transferPeer: { id: "p", accountId: "a2", bookingDate: "2024-06-02", account: account({ id: "a2" }) } as any })
    const { user } = setup(linked, { "DELETE /transactions/:id/transfer": respond(409, { error: "Not linked to a transfer" }) })
    await user.click(screen.getByRole("button", { name: "Unlink" }))
    expect(await screen.findByText("Not linked to a transfer")).toBeInTheDocument()
  })
})

describe("TransactionDetail: subscription", () => {
  test("a transaction that belongs to a subscription links to the subscriptions page and closes the panel", async () => {
    const { onClose, user } = setup(transaction({ subscriptionId: "s1" }))
    await user.click(screen.getByRole("button", { name: /View subscription/ }))
    expect(onClose).toHaveBeenCalled()
    expect(await screen.findByRole("heading", { name: "Subscriptions page" })).toBeInTheDocument()
  })

  test("without one there is no such link", () => {
    setup(transaction({ subscriptionId: null }))
    expect(screen.queryByRole("button", { name: /View subscription/ })).not.toBeInTheDocument()
  })
})
