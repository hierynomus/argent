/**
 * A tiny program used by `src/db/persistence.test.ts` to look at the database from a separate process.
 *
 *   bun run test/dbProbe.ts <srcDir> <op> [iban]        op = write | read
 *   bun run test/dbProbe.ts <srcDir> reload <iban>      imports the db module twice, like `bun --hot` does
 *
 * Prints one JSON line: { count } (the number of accounts the database has) and, for `reload`, `sameClient`:
 * whether the second evaluation of the db module reused the first one's open PGlite client.
 */
const [srcDir, op, iban] = process.argv.slice(2)
const { accounts } = await import(`${srcDir}/db/schema.ts`)

if (op === "reload") {
  const open = () => [...((globalThis as { __argentPglite?: Map<string, unknown> }).__argentPglite?.values() ?? [])]
  const first = await import(`${srcDir}/db/index.ts?first`)
  await first.db.insert(accounts).values({ iban, currency: "EUR" })
  const before = open()
  // what a hot reload does: evaluate the module again. It must reuse the open database, not start another
  const second = await import(`${srcDir}/db/index.ts?second`)
  const after = open()
  console.log(JSON.stringify({ count: (await second.db.select().from(accounts)).length, sameClient: before.length === 1 && after.length === 1 && before[0] === after[0] }))
} else {
  const { db } = await import(`${srcDir}/db/index.ts`)
  if (op === "write") await db.insert(accounts).values({ iban, currency: "EUR" })
  console.log(JSON.stringify({ count: (await db.select().from(accounts)).length }))
}

// PGlite 0.6 keeps the process alive for a while after its last query. Exit like a stopped dev server would:
// without closing the database, so these tests also prove that what was written is already on disk.
process.exit(0)
