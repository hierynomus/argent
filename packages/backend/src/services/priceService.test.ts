import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { fakeFetch } from "../../test/fakeFetch"

// Each test gets a fresh module instance (and therefore empty in-process caches).
let n = 0
const load = () => import(`./priceService.ts?fresh=${n++}`) as Promise<typeof import("./priceService")>

beforeEach(() => fakeFetch.reset())
// The fake provider is process-wide: never leave it in a failing state for other test files.
afterEach(() => fakeFetch.reset())

describe("crypto prices", () => {
  test("returns EUR and USD prices for known symbols, case-insensitively", async () => {
    const p = await load()
    expect(await p.getCryptoPrice("BTC", "EUR")).toBe(50000)
    expect(await p.getCryptoPrice("btc", "USD")).toBe(55000)
    expect(await p.getCryptoPrice("ETH")).toBe(2000) // EUR is the default
  })

  test("unknown symbols return null", async () => {
    const p = await load()
    expect(await p.getCryptoPrice("NOPE", "EUR")).toBeNull()
    // DOGE is configured but absent from the provider response
    expect(await p.getCryptoPrice("DOGE", "EUR")).toBeNull()
  })

  test("results are cached: one provider call serves many lookups", async () => {
    const p = await load()
    await p.getCryptoPrice("BTC"); await p.getCryptoPrice("ETH"); await p.getCryptoPrice("BTC", "USD")
    expect(fakeFetch.callsTo("coingecko")).toHaveLength(1)
  })

  test("tiny prices keep their full precision (SHIB)", async () => {
    const p = await load()
    expect(await p.getCryptoPrice("SHIB", "EUR")).toBe(0.0000085)
    expect(await p.getCryptoPrice("shib", "USD")).toBe(0.0000092)
    expect(await p.getCryptoPrice("PEPE", "EUR")).toBe(0.0000071)
    expect(fakeFetch.callsTo("coingecko").every((u) => !u.includes("simple/price") || u.includes("precision=full"))).toBe(true)
  })

  test("a ticker that is not pinned is found by search, preferring the ranked coin over clones", async () => {
    const p = await load()
    expect(await p.getCryptoPrice("NEWCOIN", "EUR")).toBe(0.25)
    const priced = fakeFetch.callsTo("simple/price").at(-1)!
    expect(priced).toContain("newcoin-real")
    expect(priced).not.toContain("newcoin-clone")
  })

  test("a resolved ticker is remembered: no second search, and it is refreshed with the others", async () => {
    const p = await load()
    await p.getCryptoPrice("NEWCOIN")
    const searches = fakeFetch.callsTo("/search").length
    expect(searches).toBe(1)
    await p.getCryptoPrice("NEWCOIN", "USD")
    expect(fakeFetch.callsTo("/search")).toHaveLength(searches)
  })

  test("a ticker CoinGecko does not know is searched once, then remembered as unknown", async () => {
    const p = await load()
    expect(await p.getCryptoPrice("ZZZNOPE")).toBeNull()
    expect(await p.getCryptoPrice("ZZZNOPE")).toBeNull()
    expect(fakeFetch.callsTo("/search")).toHaveLength(1)
  })

  test("several tickers are priced with one price request", async () => {
    const p = await load()
    const prices = await p.getCryptoPrices(["BTC", "SHIB", "NEWCOIN", "NOPE"], "EUR")
    expect(prices).toEqual({ BTC: 50000, SHIB: 0.0000085, NEWCOIN: 0.25, NOPE: null })
    expect(fakeFetch.callsTo("simple/price")).toHaveLength(1)
  })

  test("a failing provider yields null instead of throwing", async () => {
    fakeFetch.failing.add("coingecko")
    const p = await load()
    expect(await p.getCryptoPrice("BTC")).toBeNull()
  })

  test("recovers on the next call after a failure (failures are not cached)", async () => {
    const p = await load()
    fakeFetch.failing.add("coingecko")
    expect(await p.getCryptoPrice("BTC")).toBeNull()
    fakeFetch.failing.clear()
    expect(await p.getCryptoPrice("BTC")).toBe(50000)
  })
})

describe("metal prices", () => {
  test("converts USD/oz to USD/g and EUR/g", async () => {
    const p = await load()
    const usdPerGram = 2000 / 31.1035
    expect(await p.getMetalPricePerGram("gold", "USD")).toBeCloseTo(usdPerGram, 6)
    expect(await p.getMetalPricePerGram("gold", "EUR")).toBeCloseTo(usdPerGram * 0.9, 6)
    expect(await p.getMetalPricePerGram("Silver", "USD")).toBeCloseTo(25 / 31.1035, 6)
  })

  test("metals missing from the provider return null", async () => {
    const p = await load()
    expect(await p.getMetalPricePerGram("platinum")).toBeNull()
    expect(await p.getMetalPricePerGram("unobtainium")).toBeNull()
  })

  test("a failing provider yields null", async () => {
    fakeFetch.failing.add("metals.live")
    const p = await load()
    expect(await p.getMetalPricePerGram("gold")).toBeNull()
  })
})

describe("stock prices", () => {
  test("native-currency quote is returned as is", async () => {
    const p = await load()
    expect(await p.getStockPrice("AAPL", "USD")).toBe(100)
    expect(await p.getStockPrice("VWRL", "EUR")).toBe(80)
  })

  test("quotes are converted via the FX rate", async () => {
    const p = await load()
    expect(await p.getStockPrice("AAPL", "EUR")).toBeCloseTo(90) // 100 USD × 0.9
    expect(await p.getStockPrice("VWRL", "USD")).toBeCloseTo(88) // 80 EUR × 1.1
  })

  test("unknown tickers return null", async () => {
    const p = await load()
    expect(await p.getStockPrice("ZZZZ", "EUR")).toBeNull()
    expect(await p.getStockName("ZZZZ")).toBeNull()
  })

  test("looks up the display name", async () => {
    const p = await load()
    expect(await p.getStockName("AAPL")).toBe("Apple Inc.")
  })

  test("quotes and FX rates are cached", async () => {
    const p = await load()
    await p.getStockPrice("AAPL", "EUR"); await p.getStockPrice("AAPL", "EUR"); await p.getStockName("AAPL")
    expect(fakeFetch.callsTo("yahoo")).toHaveLength(1)
    expect(fakeFetch.callsTo("frankfurter")).toHaveLength(1)
  })

  test("sends a browser-like User-Agent (Yahoo rejects bare requests)", async () => {
    const seen: Array<HeadersInit | undefined> = []
    const orig = globalThis.fetch
    globalThis.fetch = (async (input: any, init?: RequestInit) => { seen.push(init?.headers); return (orig as any)(input, init) }) as typeof fetch
    try {
      const p = await load()
      await p.getStockPrice("AAPL", "USD")
    } finally { globalThis.fetch = orig }
    expect(JSON.stringify(seen)).toContain("Mozilla")
  })

  test("a failing provider yields null", async () => {
    fakeFetch.failing.add("yahoo")
    const p = await load()
    expect(await p.getStockPrice("AAPL", "EUR")).toBeNull()
    expect(await p.getStockName("AAPL")).toBeNull()
  })
})

describe("price history", () => {
  test("downsample keeps first and last and caps the count", async () => {
    const p = await load()
    const pts = Array.from({ length: 1000 }, (_, i) => ({ t: i, v: i }))
    const out = p.downsample(pts, 100)
    expect(out).toHaveLength(100)
    expect(out[0]).toEqual(pts[0])
    expect(out.at(-1)).toEqual(pts.at(-1))
    expect(p.downsample(pts.slice(0, 50), 100)).toHaveLength(50) // short series are untouched
  })

  test("crypto: points in the requested currency, tiny prices at full precision, range mapped to days", async () => {
    const p = await load()
    const btc = await p.getCryptoHistory("btc", "EUR", "3m")
    expect(btc).toHaveLength(5)
    expect(btc![0]).toEqual({ t: Date.UTC(2024, 0, 1), v: 50000 })
    expect(btc![4].v).toBeCloseTo(52000, 6)
    expect((await p.getCryptoHistory("BTC", "USD", "3m"))![0].v).toBe(55000)
    expect((await p.getCryptoHistory("SHIB", "EUR", "1y"))![0].v).toBe(0.0000085)
    const urls = fakeFetch.callsTo("market_chart")
    expect(urls[0]).toContain("days=90")
    expect(urls.some((u) => u.includes("days=365"))).toBe(true)
    expect(urls[0]).toContain("precision=full")
  })

  test("crypto: max range, unknown symbol and provider failure", async () => {
    const p = await load()
    await p.getCryptoHistory("BTC", "EUR", "max")
    expect(fakeFetch.callsTo("market_chart").at(-1)).toContain("days=max")
    expect(await p.getCryptoHistory("ZZZNOPE", "EUR", "1y")).toBeNull()
    fakeFetch.failing.add("coingecko")
    const q = await load()
    expect(await q.getCryptoHistory("BTC", "EUR", "1y")).toBeNull()
  })

  test("history is cached per symbol, currency and range", async () => {
    const p = await load()
    await p.getCryptoHistory("BTC", "EUR", "1y")
    await p.getCryptoHistory("BTC", "EUR", "1y")
    expect(fakeFetch.callsTo("market_chart")).toHaveLength(1)
    await p.getCryptoHistory("BTC", "EUR", "1m") // other range → another request
    await p.getCryptoHistory("BTC", "USD", "1y") // other currency → another request
    expect(fakeFetch.callsTo("market_chart")).toHaveLength(3)
  })

  test("stocks: native currency is converted at the current rate, missing closes are skipped", async () => {
    const p = await load()
    const usd = await p.getStockHistory("AAPL", "USD", "1y")
    expect(usd).toHaveLength(4) // five timestamps, one close missing
    expect(usd![0].v).toBe(100)
    const eur = await p.getStockHistory("AAPL", "EUR", "1y")
    expect(eur![0].v).toBeCloseTo(90) // 100 USD × 0.9
    expect((await p.getStockHistory("VWRL", "EUR", "6m"))![0].v).toBe(80) // already EUR
  })

  test("stocks: ranges map to Yahoo ranges and intervals", async () => {
    const p = await load()
    await p.getStockHistory("AAPL", "USD", "1m")
    await p.getStockHistory("AAPL", "USD", "max")
    const urls = fakeFetch.callsTo("finance.yahoo.com/v8/finance/chart/AAPL").filter((u) => !u.includes("range=1d"))
    expect(urls[0]).toContain("range=1mo")
    expect(urls[0]).toContain("interval=1d")
    expect(urls[1]).toContain("range=max")
    expect(urls[1]).toContain("interval=1wk")
  })

  test("stocks: unknown symbols and provider failures give null", async () => {
    const p = await load()
    expect(await p.getStockHistory("ZZZZ", "EUR", "1y")).toBeNull()
    fakeFetch.failing.add("yahoo")
    const q = await load()
    expect(await q.getStockHistory("AAPL", "EUR", "1y")).toBeNull()
  })
})
