import { describe, expect, test } from "vitest"
import { mockApi } from "../../test/fakeApi"
import { cryptoDetail, portfolio } from "../../test/fixtures"
import { renderApp, screen, waitFor } from "../../test/render"
import CryptoPage from "./Crypto.vue"

/** A stateful fake backend: the list and each portfolio's own data, so creating a portfolio behaves like the real thing. */
function backend() {
  const list = [portfolio({ id: "p1", name: "Main" })]
  const details: Record<string, ReturnType<typeof cryptoDetail>> = {
    p1: cryptoDetail({
      id: "p1", name: "Main", totalOpenCostEur: 100, totalCurrentValueEur: 150, totalUnrealizedPnL: 50,
      positions: [{ symbol: "BTC", name: "Bitcoin", assetForm: null, balance: 1, avgCostBasis: 100, totalCostEur: 100, realizedPnL: 0, currentPrice: 150, currentValueEur: 150, unrealizedPnL: 50 }],
    }),
  }
  return mockApi({
    "GET /crypto": () => list,
    "GET /crypto/:id": ({ params }: any) => details[params.id],
    "POST /crypto": ({ body }: any) => {
      const created = portfolio({ id: "p2", name: body.name, currency: body.currency })
      list.push(created)
      details.p2 = cryptoDetail({ id: "p2", name: body.name })
      return created
    },
  })
}

describe("creating a second crypto portfolio", () => {
  test("the first portfolio keeps its positions", async () => {
    const api = backend()
    const { user } = await renderApp(CryptoPage)
    expect(await screen.findByText("Bitcoin")).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "+ New portfolio" }))
    await user.type(screen.getByLabelText("Portfolio name"), "Second")
    await user.click(screen.getByRole("button", { name: "Create" }))

    // the new (empty) portfolio is shown, with both tabs
    expect(await screen.findByText(/No positions yet/)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Main" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Second" })).toBeInTheDocument()

    // ... and going back to the first one shows everything that was there
    await user.click(screen.getByRole("button", { name: "Main" }))
    expect(await screen.findByText("Bitcoin")).toBeInTheDocument()
    expect(screen.queryByText(/No positions yet/)).not.toBeInTheDocument()
    expect(api.unmatched).toEqual([])
  })
})
