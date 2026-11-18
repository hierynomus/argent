import { XMLParser } from "fast-xml-parser"
import { createHash } from "crypto"

export interface ParsedAccount {
  iban: string
  currency: string
  ownerName: string | null
}

export interface ParsedTransaction {
  amount: string
  currency: string
  creditDebitIndicator: "CRDT" | "DBIT"
  bookingDate: string
  valueDate: string | null
  description: string | null
  counterpartyName: string | null
  counterpartyIban: string | null
  reference: string | null
  importHash: string
}

export interface ParsedStatement {
  account: ParsedAccount
  transactions: ParsedTransaction[]
  openingBalance?: { amount: string; date: string; isCredit: boolean }
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  // Keep all tag values as strings to prevent leading zeros being stripped
  // (e.g. AcctSvcrRef "0124083614379638" must not become a number)
  parseTagValue: false,
  // Ensures single entries are still arrays
  isArray: (name) => ["Ntry", "TxDtls"].includes(name),
})

/**
 * Extracts a merchant name from the AddtlNtryInf free-text field.
 * Handles the fixed-width column format used by Dutch banks (the large Dutch banks)
 * for BEA (point-of-sale) and GEA (ATM) card transactions, e.g.:
 *   "BEA, Betaalpas                  ARGOS Dorpstraat,PAS345         NR:21370651, ..."
 *   "GEA, Betaalpas                  Geldmaat Stationsplein,PAS345   NR:00012345, ..."
 */
function parseCounterpartyFromAddtlInfo(info: string | null): string | null {
  if (!info) return null
  // Split on 2+ consecutive spaces to get the fixed-width segments
  const segments = info.split(/\s{2,}/).filter(Boolean)
  if (segments.length < 2) return null
  // First segment is the payment method indicator: "BEA, Betaalpas" / "GEA, Betaalpas"
  if (!/^(BEA|GEA),/.test(segments[0])) return null
  // Second segment is "MERCHANT NAME,PASxxx" — strip the card/terminal reference
  const merchant = segments[1].replace(/,\s*(PAS|KNR|CHP)\w*.*$/, "").trim()
  return merchant || null
}

/**
 * The dedup key of a transaction: SHA-256 over account, direction, amount, currency, booking date,
 * counterparty IBAN, reference and description. All inputs are stored on the transaction row, so the
 * hashes can be recomputed in SQL (migration 0019 does; keep the two in sync).
 */
export function computeImportHash(t: {
  accountIban: string
  creditDebitIndicator: string
  amount: string
  currency: string
  bookingDate: string
  counterpartyIban: string | null
  reference: string | null
  description: string | null
}): string {
  // normalised to two decimals, exactly like the numeric(15,2) column ("12.5" and "12.50" are the same entry)
  const amount = Number(t.amount).toFixed(2)
  return createHash("sha256")
    .update([t.accountIban, t.creditDebitIndicator, amount, t.currency, t.bookingDate, t.counterpartyIban ?? "", t.reference ?? "", t.description ?? ""].join("|"))
    .digest("hex")
}

export function parseCamt053(xml: string): ParsedStatement {
  const doc = parser.parse(xml)

  // Handle both namespaced and bare documents
  const root =
    doc?.Document?.BkToCstmrStmt ?? doc?.["Document"]?.["BkToCstmrStmt"]
  if (!root) {
    throw new Error("Invalid CAMT.053 document: missing BkToCstmrStmt")
  }

  const stmt = root.Stmt
  if (!stmt) {
    throw new Error("Invalid CAMT.053 document: missing Stmt")
  }

  const acct = stmt.Acct
  const account: ParsedAccount = {
    iban: acct?.Id?.IBAN ?? "",
    currency: acct?.Ccy ?? "",
    ownerName: acct?.Ownr?.Nm ?? null,
  }

  if (!account.iban) {
    throw new Error("Invalid CAMT.053 document: missing account IBAN")
  }

  const entries: unknown[] = stmt.Ntry ?? []
  const transactions: ParsedTransaction[] = []

  for (const entry of entries) {
    const e = entry as Record<string, unknown>

    const amountRaw = e.Amt as Record<string, unknown> | undefined
    const amount = String(
      typeof amountRaw === "object" ? (amountRaw["#text"] ?? amountRaw) : amountRaw ?? "0"
    )
    const currency =
      (typeof amountRaw === "object" ? (amountRaw["@_Ccy"] as string) : null) ?? account.currency

    const creditDebitIndicator = (e.CdtDbtInd as string) === "CRDT" ? "CRDT" : "DBIT"

    const bookingDate =
      (e.BookgDt as Record<string, string> | undefined)?.Dt ?? ""
    const valueDate =
      (e.ValDt as Record<string, string> | undefined)?.Dt ?? null

    // Dig into NtryDtls > TxDtls for counterparty and remittance info
    const ntryDtls = e.NtryDtls as Record<string, unknown> | undefined
    const txDtlsArr = (ntryDtls?.TxDtls as unknown[]) ?? []
    const txDtls = (txDtlsArr[0] ?? {}) as Record<string, unknown>

    const addtlNtryInf = (e.AddtlNtryInf as string | undefined) ?? null
    const acctSvcrRef = (e.AcctSvcrRef as string | undefined) ?? null

    const rltdPties = txDtls.RltdPties as Record<string, unknown> | undefined
    const cdtDbtParty = creditDebitIndicator === "CRDT" ? rltdPties?.Dbtr : rltdPties?.Cdtr
    const cdtDbtAcct =
      creditDebitIndicator === "CRDT" ? rltdPties?.DbtrAcct : rltdPties?.CdtrAcct

    const counterpartyName =
      ((cdtDbtParty as Record<string, unknown> | undefined)?.Nm as string) ??
      parseCounterpartyFromAddtlInfo(addtlNtryInf) ??
      null
    const counterpartyIban =
      ((cdtDbtAcct as Record<string, unknown> | undefined)?.Id as Record<string, string> | undefined)
        ?.IBAN ?? null

    const rmtInf = txDtls.RmtInf as Record<string, unknown> | undefined

    const description = (rmtInf?.Ustrd as string) ?? addtlNtryInf ?? null

    const refs = txDtls.Refs as Record<string, unknown> | undefined
    const reference =
      (refs?.EndToEndId as string) ?? (refs?.TxId as string) ?? acctSvcrRef ?? null

    const importHash = computeImportHash({ accountIban: account.iban, creditDebitIndicator, amount, currency, bookingDate, counterpartyIban, reference, description })

    transactions.push({
      amount,
      currency,
      creditDebitIndicator,
      bookingDate,
      valueDate,
      description,
      counterpartyName,
      counterpartyIban,
      reference,
      importHash,
    })
  }

  // Parse opening balance from Bal elements (OPBD = Opening Balance Day)
  let openingBalance: ParsedStatement["openingBalance"]
  const bals = Array.isArray(stmt.Bal) ? stmt.Bal : stmt.Bal ? [stmt.Bal] : []
  const opbd = (bals as Record<string, unknown>[]).find(
    (b) => (b?.Tp as Record<string, unknown> | undefined)?.CdOrPrtry &&
            ((b.Tp as Record<string, unknown>).CdOrPrtry as Record<string, unknown>)?.Cd === "OPBD"
  )
  if (opbd) {
    const amtNode = opbd.Amt as Record<string, unknown> | string | undefined
    const amount = String(
      typeof amtNode === "object" ? (amtNode?.["#text"] ?? amtNode) : amtNode ?? "0"
    )
    const dtNode = opbd.Dt as Record<string, string> | undefined
    const date = dtNode?.Dt ?? dtNode?.DtTm?.split("T")[0] ?? null
    const isCredit = (opbd.CdtDbtInd as string) === "CRDT"
    if (amount && date) openingBalance = { amount, date, isCredit }
  }

  return { account, transactions, openingBalance }
}
