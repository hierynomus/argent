import { QueryClient } from "@tanstack/vue-query"
import { describe, expect, test } from "vitest"
import { mockApi } from "../../test/fakeApi"
import { cryptoDetail, portfolio } from "../../test/fixtures"
import { renderApp, screen } from "../../test/render"
import CryptoPage from "./Crypto.vue"

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** The query client the real app uses (see main.ts): results are cached and kept between views. */
const appClient = () => new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: 1 } } })

/** A stateful fake backend: the list and each portfolio's own data, so creating a portfolio behaves like the real thing. */
function backend(delayMs = 0) {
  const list = [portfolio({ id: "p1", name: "Main" })]
  const details: Record<string, ReturnType<typeof cryptoDetail>> = {
    p1: cryptoDetail({
      id: "p1", name: "Main", totalOpenCost: 100, totalCurrentValue: 150, totalUnrealizedPnL: 50,
      positions: [{ symbol: "BTC", name: "Bitcoin", assetForm: null, balance: 1, avgCostBasis: 100, totalCost: 100, realizedPnL: 0, currentPrice: 150, currentValue: 150, unrealizedPnL: 50 }],
    }),
  }
  return mockApi({
    "GET /crypto": async () => { await sleep(delayMs); return list },
    "GET /crypto/:id": async ({ params }: any) => { await sleep(delayMs * 3); return details[params.id] },
    "POST /crypto": async ({ body }: any) => {
      await sleep(delayMs)
      const created = portfolio({ id: "p2", name: body.name, currency: body.currency })
      list.push(created)
      details.p2 = cryptoDetail({ id: "p2", name: body.name })
      return created
    },
  })
}

async function createSecond(user: any) {
  await user.click(screen.getByRole("button", { name: "+ New portfolio" }))
  await user.type(screen.getByLabelText("Portfolio name"), "Second")
  await user.click(screen.getByRole("button", { name: "Create" }))
  expect(await screen.findByText(/No positions yet/)).toBeInTheDocument() // the new, empty portfolio is shown
}

describe("creating a second crypto portfolio", () => {
  test("the first portfolio keeps its positions after switching back to it", async () => {
    const api = backend()
    const { user } = await renderApp(CryptoPage)
    expect(await screen.findByText("Bitcoin")).toBeInTheDocument()
    await createSecond(user)
    expect(screen.getByRole("button", { name: "Main" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Second" })).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Main" }))
    expect(await screen.findByText("Bitcoin")).toBeInTheDocument()
    expect(screen.queryByText(/No positions yet/)).not.toBeInTheDocument()
    expect(api.unmatched).toEqual([])
  })

  test("the same with the app's real cache settings and slow responses", async () => {
    backend(15)
    const { user } = await renderApp(CryptoPage, { client: appClient() })
    expect(await screen.findByText("Bitcoin")).toBeInTheDocument()
    await createSecond(user)
    await sleep(150) // let any refetch started by the creation settle

    await user.click(screen.getByRole("button", { name: "Main" }))
    expect(await screen.findByText("Bitcoin")).toBeInTheDocument()
    expect(screen.queryByText(/No positions yet/)).not.toBeInTheDocument()
  })
})
