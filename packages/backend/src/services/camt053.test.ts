import { describe, expect, test } from "bun:test"
import { parseCamt053 } from "./camt053"

const doc = (stmtBody: string) => `<?xml version="1.0"?>
<Document><BkToCstmrStmt><Stmt>${stmtBody}</Stmt></BkToCstmrStmt></Document>`

const acct = `<Acct><Id><IBAN>NL01BANK0123456789</IBAN></Id><Ccy>EUR</Ccy><Ownr><Nm>J Doe</Nm></Ownr></Acct>`

const entry = (over: { ind?: string; amt?: string; ref?: string; ustrd?: string; addtl?: string; cpIban?: string; cpName?: string } = {}) => `
<Ntry>
  <Amt Ccy="EUR">${over.amt ?? "12.50"}</Amt>
  <CdtDbtInd>${over.ind ?? "DBIT"}</CdtDbtInd>
  <BookgDt><Dt>2024-03-05</Dt></BookgDt>
  <ValDt><Dt>2024-03-06</Dt></ValDt>
  ${over.addtl ? `<AddtlNtryInf>${over.addtl}</AddtlNtryInf>` : ""}
  <NtryDtls><TxDtls>
    <Refs><EndToEndId>${over.ref ?? "E2E-1"}</EndToEndId></Refs>
    <RltdPties>
      <Cdtr><Nm>${over.cpName ?? "Shop BV"}</Nm></Cdtr>
      <CdtrAcct><Id><IBAN>${over.cpIban ?? "NL02SHOP0000000001"}</IBAN></Id></CdtrAcct>
      <Dbtr><Nm>Payer</Nm></Dbtr>
      <DbtrAcct><Id><IBAN>NL03PAYR0000000001</IBAN></Id></DbtrAcct>
    </RltdPties>
    <RmtInf><Ustrd>${over.ustrd ?? "Invoice 42"}</Ustrd></RmtInf>
  </TxDtls></NtryDtls>
</Ntry>`

describe("parseCamt053", () => {
  test("parses account details", () => {
    const r = parseCamt053(doc(acct))
    expect(r.account).toEqual({ iban: "NL01BANK0123456789", currency: "EUR", ownerName: "J Doe" })
    expect(r.transactions).toEqual([])
  })

  test("parses a debit entry (counterparty is the creditor)", () => {
    const [tx] = parseCamt053(doc(acct + entry())).transactions
    expect(tx).toMatchObject({
      amount: "12.50",
      currency: "EUR",
      creditDebitIndicator: "DBIT",
      bookingDate: "2024-03-05",
      valueDate: "2024-03-06",
      description: "Invoice 42",
      counterpartyName: "Shop BV",
      counterpartyIban: "NL02SHOP0000000001",
      reference: "E2E-1",
    })
  })

  test("credit entry uses the debtor as counterparty", () => {
    const [tx] = parseCamt053(doc(acct + entry({ ind: "CRDT" }))).transactions
    expect(tx.creditDebitIndicator).toBe("CRDT")
    expect(tx.counterpartyName).toBe("Payer")
    expect(tx.counterpartyIban).toBe("NL03PAYR0000000001")
  })

  test("a single entry is still returned as an array", () => {
    expect(parseCamt053(doc(acct + entry())).transactions).toHaveLength(1)
    expect(parseCamt053(doc(acct + entry() + entry({ ref: "E2E-2" }))).transactions).toHaveLength(2)
  })

  test("importHash is a deterministic sha256 hex digest", () => {
    const a = parseCamt053(doc(acct + entry())).transactions[0].importHash
    const b = parseCamt053(doc(acct + entry())).transactions[0].importHash
    expect(a).toBe(b)
    expect(a).toMatch(/^[0-9a-f]{64}$/)
  })

  test("importHash changes when any identifying field changes", () => {
    const base = parseCamt053(doc(acct + entry())).transactions[0].importHash
    for (const over of [{ amt: "12.51" }, { ref: "E2E-9" }, { ustrd: "Other" }, { cpIban: "NL09OTHR0000000001" }]) {
      expect(parseCamt053(doc(acct + entry(over))).transactions[0].importHash).not.toBe(base)
    }
  })

  test("card payments: merchant extracted from AddtlNtryInf when no party name", () => {
    const xml = `<Ntry>
      <Amt Ccy="EUR">5.00</Amt><CdtDbtInd>DBIT</CdtDbtInd>
      <BookgDt><Dt>2024-03-05</Dt></BookgDt>
      <AddtlNtryInf>BEA, Betaalpas                  ARGOS Dorpstraat,PAS345         NR:21370651</AddtlNtryInf>
    </Ntry>`
    const [tx] = parseCamt053(doc(acct + xml)).transactions
    expect(tx.counterpartyName).toBe("ARGOS Dorpstraat")
    expect(tx.description).toContain("BEA, Betaalpas")
  })

  test("preserves leading zeros in references", () => {
    const xml = `<Ntry><Amt Ccy="EUR">1.00</Amt><CdtDbtInd>CRDT</CdtDbtInd>
      <BookgDt><Dt>2024-01-01</Dt></BookgDt><AcctSvcrRef>0124083614379638</AcctSvcrRef></Ntry>`
    expect(parseCamt053(doc(acct + xml)).transactions[0].reference).toBe("0124083614379638")
  })

  test("parses opening balance (OPBD)", () => {
    const bal = `<Bal><Tp><CdOrPrtry><Cd>OPBD</Cd></CdOrPrtry></Tp><Amt Ccy="EUR">100.00</Amt><CdtDbtInd>CRDT</CdtDbtInd><Dt><Dt>2024-01-01</Dt></Dt></Bal>`
    expect(parseCamt053(doc(acct + bal)).openingBalance).toEqual({ amount: "100.00", date: "2024-01-01", isCredit: true })
  })

  test("rejects invalid documents", () => {
    expect(() => parseCamt053("<Document></Document>")).toThrow("BkToCstmrStmt")
    expect(() => parseCamt053(`<Document><BkToCstmrStmt></BkToCstmrStmt></Document>`)).toThrow("Stmt")
    expect(() => parseCamt053(doc("<Acct><Id></Id></Acct>"))).toThrow("IBAN")
  })

  // KNOWN GAP: `import_hash` is globally unique but is computed WITHOUT the account and the debit/credit
  // direction. Two accounts that book an identical entry (same amount, date, counterparty IBAN, reference
  // and description) collide, and the second is silently skipped as a "duplicate". Fixing it changes every
  // stored hash, so it needs a data migration (all inputs are stored, so hashes can be recomputed).
  test.todo("importHash differs for the same entry on a different account")
  test.todo("importHash differs for the same entry booked in the opposite direction")
})
