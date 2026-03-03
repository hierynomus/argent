/**
 * Price service — fetches live prices for crypto and precious metals.
 * Uses in-process Map cache with 5-minute TTL. Errors return null (never throw).
 */

const CACHE_TTL_MS = 5 * 60 * 1000

// ──────────────────────────────────────────────
// Crypto — CoinGecko public API (no key needed)
// ──────────────────────────────────────────────

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
}

interface CryptoCache {
  prices: Record<string, { eur: number; usd: number }>
  fetchedAt: number
}

let cryptoCache: CryptoCache | null = null

async function refreshCryptoPrices(): Promise<Record<string, { eur: number; usd: number }>> {
  const ids = Object.values(COINGECKO_IDS).join(",")
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=eur,usd`
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
  if (!res.ok) throw new Error(`CoinGecko HTTP ${res.status}`)
  const json = await res.json() as Record<string, { eur?: number; usd?: number }>
  const result: Record<string, { eur: number; usd: number }> = {}
  for (const [sym, cgId] of Object.entries(COINGECKO_IDS)) {
    const data = json[cgId]
    if (data?.eur != null && data?.usd != null) {
      result[sym] = { eur: data.eur, usd: data.usd }
    }
  }
  return result
}

/** Returns price per coin in the given currency, or null if unknown/unavailable. */
export async function getCryptoPrice(symbol: string, currency: "EUR" | "USD" = "EUR"): Promise<number | null> {
  try {
    const now = Date.now()
    if (!cryptoCache || now - cryptoCache.fetchedAt > CACHE_TTL_MS) {
      const prices = await refreshCryptoPrices()
      cryptoCache = { prices, fetchedAt: now }
    }
    const entry = cryptoCache.prices[symbol.toUpperCase()]
    if (!entry) return null
    return currency === "USD" ? entry.usd : entry.eur
  } catch {
    return null
  }
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
