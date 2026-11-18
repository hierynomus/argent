/**
 * Deterministic stand-in for the third-party price APIs. Installed for every
 * test run so nothing can reach the real network.
 *
 *  CoinGecko   BTC 50000 EUR / 55000 USD, ETH 2000 EUR / 2200 USD, SHIB and PEPE (tiny, pinned), NEWCOIN (found by search only)
 *  metals.live XAU 2000 USD/oz, XAG 25 USD/oz            (gold & silver only)
 *  Frankfurter USD→EUR 0.9, EUR→USD 1.1
 *  Yahoo       AAPL 100 USD "Apple Inc.", VWRL 80 EUR "Vanguard FTSE All-World", others → no data
 */
export const fakeFetch = {
  /** URLs requested so far (most recent last). */
  calls: [] as string[],
  /** Hosts (substring match) that currently answer with HTTP 500. */
  failing: new Set<string>(),
  reset() {
    this.calls.length = 0
    this.failing.clear()
  },
  callsTo(host: string) {
    return this.calls.filter((u) => u.includes(host))
  },
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })

const YAHOO: Record<string, { price: number; currency: string; name: string }> = {
  AAPL: { price: 100, currency: "USD", name: "Apple Inc." },
  VWRL: { price: 80, currency: "EUR", name: "Vanguard FTSE All-World" },
}

export async function fakeFetchImpl(input: RequestInfo | URL): Promise<Response> {
  const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url
  fakeFetch.calls.push(url)
  for (const host of fakeFetch.failing) if (url.includes(host)) return json({ error: "boom" }, 500)

  if (url.includes("api.coingecko.com/api/v3/search")) {
    const query = (new URL(url).searchParams.get("query") ?? "").toUpperCase()
    // two coins share the ticker NEWCOIN: the ranked one is the real one; NEWCOINX must not match NEWCOIN
    const coins = [
      { id: "newcoin-clone", symbol: "NEWCOIN", market_cap_rank: null },
      { id: "newcoin-real", symbol: "NEWCOIN", market_cap_rank: 30 },
      { id: "newcoinx", symbol: "NEWCOINX", market_cap_rank: 900 },
    ].filter((c) => c.symbol.startsWith(query))
    return json({ coins })
  }
  if (url.includes("api.coingecko.com")) {
    // only the requested ids are answered, as the real API does
    const ids = (new URL(url).searchParams.get("ids") ?? "").split(",")
    const all: Record<string, { eur: number; usd: number }> = {
      bitcoin: { eur: 50000, usd: 55000 },
      ethereum: { eur: 2000, usd: 2200 },
      "shiba-inu": { eur: 0.0000085, usd: 0.0000092 },
      pepe: { eur: 0.0000071, usd: 0.0000078 },
      "newcoin-real": { eur: 0.25, usd: 0.28 },
    }
    return json(Object.fromEntries(ids.filter((id) => id in all).map((id) => [id, all[id]])))
  }
  if (url.includes("metals.live")) return json([{ XAU: 2000, XAG: 25 }])
  if (url.includes("frankfurter.app")) {
    const to = new URL(url).searchParams.get("to") ?? "EUR"
    const from = new URL(url).searchParams.get("from") ?? "USD"
    const rates: Record<string, number> = { "USD>EUR": 0.9, "EUR>USD": 1.1 }
    const rate = rates[`${from}>${to}`]
    return rate ? json({ rates: { [to]: rate } }) : json({ rates: {} })
  }
  if (url.includes("query1.finance.yahoo.com")) {
    const symbol = decodeURIComponent(url.split("/chart/")[1].split("?")[0])
    const q = YAHOO[symbol]
    if (!q) return json({ chart: { result: null } })
    return json({ chart: { result: [{ meta: { regularMarketPrice: q.price, currency: q.currency, longName: q.name } }] } })
  }
  throw new Error(`Unexpected network request in tests: ${url}`)
}

globalThis.fetch = fakeFetchImpl as typeof fetch
