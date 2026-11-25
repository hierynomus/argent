import { Hono, type Context } from "hono"
import { bodyLimit } from "hono/body-limit"
import { unzipSync, strFromU8 } from "fflate"
import { eq } from "drizzle-orm"
import { db } from "../db"
import { accounts, transactions } from "../db/schema"
import { parseCamt053 } from "../services/camt053"
import { refreshImportHashes } from "../services/importHash"
import { linkTransfers } from "../services/transferLinker"
import { runBackgroundJobs } from "../services/backgroundJobs"
import { getEditableAccountIds } from "../services/accessControl"
import type { ImportResult } from "@argent/shared"
import type { AuthUser } from "../middleware/auth"

const app = new Hono<{ Variables: { user: AuthUser } }>()

const MB = 1024 * 1024
/** Upload limits. A year of bank statements is a few hundred kB: these leave plenty of room and stop accidents and abuse. */
export const IMPORT_LIMITS = { xmlBytes: 10 * MB, zipBytes: 25 * MB, unzippedBytes: 100 * MB, zipEntries: 1000 }

/** Rejects oversized request bodies early (a little above the file limit: the multipart envelope adds some). */
const limitBody = (maxFileBytes: number) =>
  bodyLimit({ maxSize: maxFileBytes + MB, onError: (c) => c.json({ error: `File too large (the maximum is ${maxFileBytes / MB} MB)` }, 413) })

/** The uploaded `file` field, or the error response to send. */
async function uploadedFile(c: Context, maxBytes: number): Promise<{ file: File } | { response: Response }> {
  const file = (await c.req.formData().catch(() => null))?.get("file")
  if (!file || typeof file === "string") return { response: c.json({ error: "file field is required" }, 400) }
  if (file.size === 0) return { response: c.json({ error: "The file is empty" }, 400) }
  if (file.size > maxBytes) return { response: c.json({ error: `File too large (the maximum is ${maxBytes / MB} MB)` }, 413) }
  return { file }
}

class ZipTooLarge extends Error {}

/**
 * Import a parsed CAMT.053 XML for the given user.
 * - Requires the global import permission (canImport, from argent-import group).
 * - If the IBAN exists and the user's groups have editor access: allows import.
 * - If the IBAN exists and no editor group access: 403.
 * - If the IBAN is new: creates the account (admin assigns group access afterward).
 */
async function importXml(
  xml: string,
  groups: string[],
  sub: string,
  isAdmin: boolean,
  canImport: boolean,
): Promise<ImportResult> {
  if (!canImport) {
    throw new Error("Access denied: you do not have permission to import")
  }

  const parsed = parseCamt053(xml)

  // Check if account already exists and user has editor access via ownership or group role
  const existing = await db.query.accounts.findFirst({
    where: (a, { eq }) => eq(a.iban, parsed.account.iban),
  })

  if (existing && !isAdmin) {
    const isOwner = existing.ownerSub != null && existing.ownerSub === sub
    if (!isOwner) {
      const editableIds = await getEditableAccountIds({ groups, sub, isAdmin: false })
      if (!editableIds.includes(existing.id)) {
        throw new Error("Access denied: account already exists and none of your groups have editor access")
      }
    }
  }

  let [account] = await db
    .insert(accounts)
    .values({
      iban: parsed.account.iban,
      currency: parsed.account.currency,
      name: parsed.account.ownerName,
      ownerSub: sub,
    })
    .onConflictDoUpdate({
      target: accounts.iban,
      set: { currency: parsed.account.currency },
    })
    .returning()

  // Auto-set opening balance from CAMT OPBD entry if it's earlier than the current one
  if (parsed.openingBalance) {
    const { amount, date, isCredit } = parsed.openingBalance
    const signedAmount = isCredit ? amount : `-${amount}`
    const shouldUpdate = !account.openingBalanceDate || date < account.openingBalanceDate
    if (shouldUpdate) {
      const [updated] = await db
        .update(accounts)
        .set({ openingBalance: signedAmount, openingBalanceDate: date })
        .where(eq(accounts.id, account.id))
        .returning()
      account = updated
    }
  }

  // entries that came in with an older hash would not be recognised below and would be added a second time
  await refreshImportHashes(account.id)

  let imported = 0
  let skipped = 0

  for (const tx of parsed.transactions) {
    const result = await db
      .insert(transactions)
      .values({
        accountId: account.id,
        amount: tx.amount,
        currency: tx.currency,
        creditDebitIndicator: tx.creditDebitIndicator,
        bookingDate: tx.bookingDate,
        valueDate: tx.valueDate,
        description: tx.description,
        counterpartyName: tx.counterpartyName,
        counterpartyIban: tx.counterpartyIban,
        reference: tx.reference,
        importHash: tx.importHash,
      })
      .onConflictDoNothing({ target: transactions.importHash })
      .returning()

    if (result.length > 0) imported++
    else skipped++
  }

  return { accountIban: account.iban, imported, skipped }
}

app.post("/", limitBody(IMPORT_LIMITS.xmlBytes), async (c) => {
  const user = c.get("user")
  const upload = await uploadedFile(c, IMPORT_LIMITS.xmlBytes)
  if ("response" in upload) return upload.response

  const xml = await upload.file.text()
  if (!xml.replace(/^\uFEFF/, "").trimStart().startsWith("<")) {
    return c.json({ error: "That does not look like an XML file (expected a CAMT.053 statement)" }, 422)
  }

  try {
    const result = await importXml(xml, user.groups ?? [], user.sub, user.isAdmin, user.canImport)
    void runBackgroundJobs("import")
    return c.json(result, 201)
  } catch (err) {
    const message = (err as Error).message
    if (message.startsWith("Access denied")) return c.json({ error: message }, 403)
    return c.json({ error: `Failed to parse CAMT.053: ${message}` }, 422)
  }
})

app.post("/zip", limitBody(IMPORT_LIMITS.zipBytes), async (c) => {
  const user = c.get("user")
  const upload = await uploadedFile(c, IMPORT_LIMITS.zipBytes)
  if ("response" in upload) return upload.response

  const bytes = new Uint8Array(await upload.file.arrayBuffer())
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) return c.json({ error: "That does not look like a ZIP file" }, 422)

  let entries: Record<string, Uint8Array>
  try {
    // the filter sees each entry's declared size BEFORE it is decompressed, so a zip bomb is refused up front
    let count = 0
    let total = 0
    entries = unzipSync(bytes, {
      filter: (entry) => {
        if (!entry.name.toLowerCase().endsWith(".xml") || entry.name.startsWith("__MACOSX")) return false
        count++
        total += entry.originalSize
        if (count > IMPORT_LIMITS.zipEntries) throw new ZipTooLarge(`The ZIP has more than ${IMPORT_LIMITS.zipEntries} statements`)
        if (entry.originalSize > IMPORT_LIMITS.xmlBytes) throw new ZipTooLarge(`"${entry.name}" is larger than ${IMPORT_LIMITS.xmlBytes / MB} MB`)
        if (total > IMPORT_LIMITS.unzippedBytes) throw new ZipTooLarge(`The ZIP expands to more than ${IMPORT_LIMITS.unzippedBytes / MB} MB`)
        return true
      },
    })
  } catch (err) {
    if (err instanceof ZipTooLarge) return c.json({ error: err.message }, 413)
    return c.json({ error: `Failed to open ZIP: ${(err as Error).message}` }, 422)
  }

  const xmlFiles = Object.entries(entries)
    .filter(([name]) => name.toLowerCase().endsWith(".xml") && !name.startsWith("__MACOSX"))
    .sort(([a], [b]) => a.localeCompare(b))

  if (xmlFiles.length === 0) {
    return c.json({ error: "No XML files found in ZIP" }, 422)
  }

  const results: Array<ImportResult & { filename: string }> = []
  const errors: Array<{ filename: string; error: string }> = []

  for (const [name, data] of xmlFiles) {
    const filename = name.split("/").pop() ?? name
    try {
      const result = await importXml(strFromU8(data), user.groups ?? [], user.sub, user.isAdmin, user.canImport)
      results.push({ filename, ...result })
    } catch (err) {
      errors.push({ filename, error: (err as Error).message })
    }
  }

  void runBackgroundJobs("import")
  return c.json({ results, errors }, 201)
})

// Manual trigger — useful for re-running on already-imported data
app.post("/link-transfers", async (c) => {
  const linked = await linkTransfers()
  return c.json({ linked })
})

export default app
