/**
 * Deterministic stand-in for the third-party price APIs. Installed for every
 * test run so nothing can reach the real network.
 *
 *  CoinGecko   BTC 50000 EUR / 55000 USD, ETH 2000 EUR / 2200 USD, SHIB and PEPE (tiny, pinned), NEWCOIN (found by search only)
 *  metals.live XAU 2000 USD/oz, XAG 25 USD/oz            (gold & silver only)
 *  Frankfurter USD→EUR 0.9, EUR→USD 1.1
 *  History     CoinGecko market_chart (bitcoin, shiba-inu: 5 daily points) and Yahoo chart ranges (AAPL, VWRL)
 *  Yahoo       AAPL 100 USD "Apple Inc.", VWRL 80 EUR "Vanguard FTSE All-World", DOGE-EUR 0.1, ADA-USD 0.5, others → no data
 */
export const fakeFetch = {
  /** URLs requested so far (most recent last). */
  calls: [] as string[],
  /** Hosts (substring match) that currently answer with HTTP 500. */
  failing: new Set<string>(),
  /** Hosts (substring match) that currently answer with HTTP 429 and `retry-after: 30`. */
  rateLimited: new Set<string>(),
  reset() {
    this.calls.length = 0
    this.failing.clear()
    this.rateLimited.clear()
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
  // London quotes in pence ("GBp"), not pounds
  "VOD.L": { price: 70, currency: "GBp", name: "Vodafone Group" },
  // coins Yahoo lists as pairs (the fallback when CoinGecko is rate limited)
  "DOGE-EUR": { price: 0.1, currency: "EUR", name: "Dogecoin EUR" },
  "ADA-USD": { price: 0.5, currency: "USD", name: "Cardano USD" },
}

export async function fakeFetchImpl(input: RequestInfo | URL): Promise<Response> {
  const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url
  fakeFetch.calls.push(url)
  for (const host of fakeFetch.failing) if (url.includes(host)) return json({ error: "boom" }, 500)
  for (const host of fakeFetch.rateLimited) {
    if (url.includes(host)) return new Response(JSON.stringify({ status: { error_code: 429 } }), { status: 429, headers: { "Content-Type": "application/json", "retry-after": "30" } })
  }

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
  if (url.includes("api.coingecko.com/api/v3/coins/") && url.includes("/market_chart")) {
    const id = decodeURIComponent(url.split("/coins/")[1].split("/")[0])
    const vs = new URL(url).searchParams.get("vs_currency") ?? "eur"
    const base: Record<string, { eur: number; usd: number }> = { bitcoin: { eur: 50000, usd: 55000 }, "shiba-inu": { eur: 0.0000085, usd: 0.0000092 } }
    const b = base[id]
    if (!b) return json({ error: "coin not found" }, 404)
    const day = 86_400_000
    const t0 = Date.UTC(2024, 0, 1)
    // five daily points rising 1% a day from the base price
    return json({ prices: [0, 1, 2, 3, 4].map((i) => [t0 + i * day, (vs === "usd" ? b.usd : b.eur) * (1 + i / 100)]) })
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
    const rates: Record<string, number> = { "USD>EUR": 0.9, "EUR>USD": 1.1, "GBP>EUR": 1.2, "GBP>USD": 1.3 }
    const rate = rates[`${from}>${to}`]
    return rate ? json({ rates: { [to]: rate } }) : json({ rates: {} })
  }
  if (url.includes("query1.finance.yahoo.com")) {
    const symbol = decodeURIComponent(url.split("/chart/")[1].split("?")[0])
    const q = YAHOO[symbol]
    if (!q) return json({ chart: { result: null } })
    if (!url.includes("range=1d")) {
      // a history request: five daily closes (one of them missing), rising 1% a day
      const t0 = Date.UTC(2024, 0, 1) / 1000
      const closes = [0, 1, 2, 3, 4].map((i) => (i === 2 ? null : q.price * (1 + i / 100)))
      return json({ chart: { result: [{ meta: { regularMarketPrice: q.price, currency: q.currency }, timestamp: [0, 1, 2, 3, 4].map((i) => t0 + i * 86400), indicators: { quote: [{ close: closes }] } }] } })
    }
    return json({ chart: { result: [{ meta: { regularMarketPrice: q.price, currency: q.currency, longName: q.name } }] } })
  }
  throw new Error(`Unexpected network request in tests: ${url}`)
}

globalThis.fetch = fakeFetchImpl as typeof fetch
