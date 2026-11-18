/**
 * Price service — fetches live prices for crypto and precious metals.
 * Uses in-process Map cache with 5-minute TTL. Errors return null (never throw).
 */

const CACHE_TTL_MS = 5 * 60 * 1000

// ──────────────────────────────────────────────
// Crypto — CoinGecko public API (no key needed)
// ──────────────────────────────────────────────

/**
 * Ticker → CoinGecko id for the common coins (many tickers are ambiguous on CoinGecko, so these are
 * pinned). Any other ticker is resolved through CoinGecko's search, see `resolveCoinId`.
 */
const COINGECKO_IDS: Record<string, string> = {
  BTC: "bitcoin",
  ETH: "ethereum",
  SOL: "solana",
  XRP: "ripple",
  ADA: "cardano",
  DOT: "polkadot",
  DOGE: "dogecoin",
  AVAX: "avalanche-2",
  MATIC: "matic-network",
  LINK: "chainlink",
  LTC: "litecoin",
  BNB: "binancecoin",
  TRX: "tron",
  TON: "the-open-network",
  SHIB: "shiba-inu",
  PEPE: "pepe",
  BONK: "bonk",
  FLOKI: "floki",
  WIF: "dogwifcoin",
  USDT: "tether",
  USDC: "usd-coin",
  ATOM: "cosmos",
  UNI: "uniswap",
  NEAR: "near",
  APT: "aptos",
  ARB: "arbitrum",
  OP: "optimism",
  SUI: "sui",
  XLM: "stellar",
  ETC: "ethereum-classic",
  BCH: "bitcoin-cash",
  XMR: "monero",
  HBAR: "hedera-hashgraph",
  AAVE: "aave",
}

const ID_FOUND_TTL_MS = 24 * 60 * 60 * 1000
const ID_MISSING_TTL_MS = 60 * 60 * 1000 // don't search again for a ticker CoinGecko doesn't know, for an hour

/** Resolved ticker → id. `id: null` means "searched, not found". The pinned ids never expire. */
const coinIds = new Map<string, { id: string | null; resolvedAt: number }>()
const cryptoPrices = new Map<string, { eur: number; usd: number; fetchedAt: number }>()

/** The CoinGecko id for a ticker: pinned, previously resolved, or found by search (most valuable coin with exactly that ticker). */
async function resolveCoinId(symbol: string): Promise<string | null> {
  const pinned = COINGECKO_IDS[symbol]
  if (pinned) return pinned
  const known = coinIds.get(symbol)
  if (known && Date.now() - known.resolvedAt < (known.id ? ID_FOUND_TTL_MS : ID_MISSING_TTL_MS)) return known.id

  const res = await fetch(`https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(symbol)}`, { signal: AbortSignal.timeout(8000) })
  if (!res.ok) throw new Error(`CoinGecko search HTTP ${res.status}`)
  const json = await res.json() as { coins?: Array<{ id: string; symbol: string; market_cap_rank: number | null }> }
  const best = (json.coins ?? [])
    .filter((c) => c.symbol.toUpperCase() === symbol)
    // many scam/clone tokens reuse popular tickers: the best-ranked coin is the real one; unranked last
    .sort((a, b) => (a.market_cap_rank ?? Infinity) - (b.market_cap_rank ?? Infinity))[0]
  coinIds.set(symbol, { id: best?.id ?? null, resolvedAt: Date.now() })
  return best?.id ?? null
}

/**
 * Prices per coin for several tickers at once, in the given currency (null = unknown/unavailable).
 * One provider call refreshes every coin we know about, so the next lookups are served from the cache.
 * Tiny prices (SHIB, PEPE, …) are requested at full precision.
 */
export async function getCryptoPrices(symbols: string[], currency: "EUR" | "USD" = "EUR"): Promise<Record<string, number | null>> {
  const wanted = [...new Set(symbols.map((s) => s.toUpperCase()))]
  const now = Date.now()
  const pick = (s: string) => {
    const e = cryptoPrices.get(s)
    return e ? (currency === "USD" ? e.usd : e.eur) : null
  }
  const fresh = (s: string) => {
    const e = cryptoPrices.get(s)
    return !!e && now - e.fetchedAt < CACHE_TTL_MS
  }

  if (!wanted.every(fresh)) {
    try {
      // ids of the requested tickers; one that can't be resolved simply stays null
      const requested = await Promise.all(wanted.map(async (s) => [s, await resolveCoinId(s).catch(() => null)] as const))
      const idOf = new Map<string, string>(requested.filter((r): r is [string, string] => r[1] !== null))
      // refresh everything we know in the same request
      const allSymbols = new Map<string, string>(Object.entries(COINGECKO_IDS))
      for (const [sym, v] of coinIds) if (v.id) allSymbols.set(sym, v.id)
      for (const [sym, id] of idOf) allSymbols.set(sym, id)

      const ids = [...new Set(allSymbols.values())].join(",")
      const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=eur,usd&precision=full`, { signal: AbortSignal.timeout(8000) })
      if (!res.ok) throw new Error(`CoinGecko HTTP ${res.status}`)
      const json = await res.json() as Record<string, { eur?: number; usd?: number }>
      for (const [sym, id] of allSymbols) {
        const data = json[id]
        if (data?.eur != null && data?.usd != null) cryptoPrices.set(sym, { eur: data.eur, usd: data.usd, fetchedAt: now })
      }
    } catch {
      // keep whatever (possibly stale) prices we have; callers get null for the rest
    }
  }
  return Object.fromEntries(wanted.map((s) => [s, fresh(s) ? pick(s) : null]))
}

/** Returns price per coin in the given currency, or null if unknown/unavailable. */
export async function getCryptoPrice(symbol: string, currency: "EUR" | "USD" = "EUR"): Promise<number | null> {
  return (await getCryptoPrices([symbol], currency))[symbol.toUpperCase()] ?? null
}

// ──────────────────────────────────────────────
// Metals — metals.live (USD/troy oz) + Frankfurter (USD→EUR)
// ──────────────────────────────────────────────

const TROY_OZ_TO_GRAMS = 31.1035

const METAL_CODES: Record<string, string> = {
  gold: "XAU",
  silver: "XAG",
  platinum: "XPT",
  palladium: "XPD",
}

interface MetalCache {
  pricesUsdPerGram: Record<string, number>  // USD per gram
  usdToEur: number
  fetchedAt: number
}

let metalCache: MetalCache | null = null

async function refreshMetalPrices(): Promise<{ pricesUsdPerGram: Record<string, number>; usdToEur: number }> {
  const [metalsRes, fxRes] = await Promise.all([
    fetch("https://metals.live/api/spot", { signal: AbortSignal.timeout(8000) }),
    fetch("https://api.frankfurter.app/latest?from=USD&to=EUR", { signal: AbortSignal.timeout(8000) }),
  ])
  if (!metalsRes.ok) throw new Error(`metals.live HTTP ${metalsRes.status}`)
  if (!fxRes.ok) throw new Error(`Frankfurter HTTP ${fxRes.status}`)

  const metalsJson = await metalsRes.json() as Array<{ metal?: string; price?: number } | Record<string, number>>
  const fxJson = await fxRes.json() as { rates: { EUR: number } }
  const usdToEur = fxJson.rates.EUR

  let spotPricesUsd: Record<string, number> = {}
  if (Array.isArray(metalsJson)) {
    for (const item of metalsJson) {
      if (typeof item === "object" && item !== null) {
        if ("metal" in item && "price" in item) {
          spotPricesUsd[(item as { metal: string; price: number }).metal] = (item as { metal: string; price: number }).price
        } else {
          Object.assign(spotPricesUsd, item)
        }
      }
    }
  } else if (typeof metalsJson === "object") {
    spotPricesUsd = metalsJson as Record<string, number>
  }

  const pricesUsdPerGram: Record<string, number> = {}
  for (const [metal, code] of Object.entries(METAL_CODES)) {
    const priceUsdPerTroyOz = spotPricesUsd[code]
    if (priceUsdPerTroyOz != null) {
      pricesUsdPerGram[metal] = priceUsdPerTroyOz / TROY_OZ_TO_GRAMS
    }
  }
  return { pricesUsdPerGram, usdToEur }
}

/** Returns price per gram in the given currency, or null if unknown/unavailable. */
export async function getMetalPricePerGram(metal: string, currency: "EUR" | "USD" = "EUR"): Promise<number | null> {
  try {
    const now = Date.now()
    if (!metalCache || now - metalCache.fetchedAt > CACHE_TTL_MS) {
      const { pricesUsdPerGram, usdToEur } = await refreshMetalPrices()
      metalCache = { pricesUsdPerGram, usdToEur, fetchedAt: now }
    }
    const usdPerGram = metalCache.pricesUsdPerGram[metal.toLowerCase()]
    if (usdPerGram == null) return null
    return currency === "USD" ? usdPerGram : usdPerGram * metalCache.usdToEur
  } catch {
    return null
  }
}

// ──────────────────────────────────────────────
// Stocks/ETFs — Yahoo Finance chart API (no key needed) + Frankfurter for FX
// ──────────────────────────────────────────────

interface StockQuote {
  price: number
  currency: string // the ticker's native trading currency, e.g. "USD", "EUR"
  name: string | null
}

interface StockCacheEntry extends StockQuote {
  fetchedAt: number
}

const stockCache = new Map<string, StockCacheEntry>()
const fxCache = new Map<string, { rate: number; fetchedAt: number }>()

async function fetchStockQuote(symbol: string): Promise<StockQuote | null> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`
  const res = await fetch(url, {
    signal: AbortSignal.timeout(8000),
    // Yahoo's chart API 429s requests without a browser-like User-Agent
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" },
  })
  if (!res.ok) throw new Error(`Yahoo Finance HTTP ${res.status}`)
  const json = await res.json() as {
    chart: { result?: Array<{ meta: { regularMarketPrice?: number; currency?: string; longName?: string; shortName?: string } }> }
  }
  const meta = json.chart.result?.[0]?.meta
  if (!meta?.regularMarketPrice || !meta.currency) return null
  return { price: meta.regularMarketPrice, currency: meta.currency, name: meta.longName ?? meta.shortName ?? null }
}

async function getStockQuote(symbol: string): Promise<StockQuote | null> {
  const key = symbol.toUpperCase()
  const now = Date.now()
  const cached = stockCache.get(key)
  if (cached && now - cached.fetchedAt < CACHE_TTL_MS) return cached

  const fresh = await fetchStockQuote(key)
  if (!fresh) return null
  stockCache.set(key, { ...fresh, fetchedAt: now })
  return fresh
}

/** Returns the ticker's display name (e.g. "Apple Inc."), or null if unknown/unavailable. */
export async function getStockName(symbol: string): Promise<string | null> {
  try {
    const quote = await getStockQuote(symbol)
    return quote?.name ?? null
  } catch {
    return null
  }
}

async function getFxRate(from: string, to: string): Promise<number | null> {
  if (from === to) return 1
  const key = `${from}_${to}`
  const now = Date.now()
  const cached = fxCache.get(key)
  if (cached && now - cached.fetchedAt < CACHE_TTL_MS) return cached.rate

  const res = await fetch(`https://api.frankfurter.app/latest?from=${from}&to=${to}`, { signal: AbortSignal.timeout(8000) })
  if (!res.ok) throw new Error(`Frankfurter HTTP ${res.status}`)
  const json = await res.json() as { rates: Record<string, number> }
  const rate = json.rates[to]
  if (rate == null) return null
  fxCache.set(key, { rate, fetchedAt: now })
  return rate
}

/** Returns price per share in the given currency, or null if unknown/unavailable. */
export async function getStockPrice(symbol: string, currency: "EUR" | "USD" = "EUR"): Promise<number | null> {
  try {
    const quote = await getStockQuote(symbol)
    if (!quote) return null
    const rate = await getFxRate(quote.currency, currency)
    return rate != null ? quote.price * rate : null
  } catch {
    return null
  }
}
