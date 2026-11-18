import { describe, expect, spyOn, test } from "bun:test"
import { mockApi, respond } from "../../../test/fakeApi"
import { renderApp, screen, waitFor, within } from "../../../test/render"
import { ImportPanel } from "./ImportPanel"

const xml = (name: string) => new File(["<Document/>"], name, { type: "application/xml" })
const zip = (name: string) => new File(["PK"], name, { type: "application/zip" })

/** The hidden file input behind the drop zone. */
const fileInput = () => document.querySelector('input[type="file"]') as HTMLInputElement

describe("ImportPanel", () => {
  test("uploads a CAMT.053 file and shows what was imported and skipped", async () => {
    const api = mockApi({ "POST /import": { accountIban: "NL01TEST0000000001", imported: 12, skipped: 3 } })
    const { user } = renderApp(<ImportPanel />)
    await user.upload(fileInput(), xml("statement.xml"))
    expect(await screen.findByText("Done")).toBeInTheDocument()
    expect(screen.getByText("statement.xml")).toBeInTheDocument()
    expect(screen.getByText("NL01TEST0000000001")).toBeInTheDocument()
    expect(screen.getByText("12")).toBeInTheDocument()
    expect(screen.getByText("3")).toBeInTheDocument()
    expect(api.calls("POST", "/import")).toHaveLength(1)
    expect((api.calls("POST", "/import")[0].body as FormData).get("file")).toBeInstanceOf(File)
  })

  test("a ZIP is expanded into one row per file it contained, including the ones that failed", async () => {
    mockApi({
      "POST /import/zip": {
        results: [
          { filename: "a.xml", accountIban: "NL01A", imported: 5, skipped: 0 },
          { filename: "b.xml", accountIban: "NL02B", imported: 7, skipped: 2 },
        ],
        errors: [{ filename: "broken.xml", error: "Failed to parse CAMT.053" }],
      },
    })
    const { user } = renderApp(<ImportPanel />)
    await user.upload(fileInput(), zip("bundle.zip"))
    expect(await screen.findByText("a.xml")).toBeInTheDocument()
    expect(screen.getByText("b.xml")).toBeInTheDocument()
    expect(screen.getByText("broken.xml", { selector: "td" })).toBeInTheDocument()
    expect(screen.queryByText("bundle.zip")).not.toBeInTheDocument() // replaced by its contents
    expect(screen.getAllByText("Done")).toHaveLength(2)
    expect(screen.getByText("Error")).toBeInTheDocument()
    expect(screen.getByText(/Failed to parse CAMT\.053/)).toBeInTheDocument()
  })

  test("several files show a total row once everything has finished", async () => {
    mockApi({ "POST /import": ({ body }: any) => ({ accountIban: "NL01", imported: 10, skipped: 1 }) })
    const { user } = renderApp(<ImportPanel />)
    await user.upload(fileInput(), [xml("one.xml"), xml("two.xml")])
    const total = await screen.findByText("Total")
    const row = total.closest("tr")!
    expect(within(row).getByText("20")).toBeInTheDocument()
    expect(within(row).getByText("2")).toBeInTheDocument()
  })

  test("a rejected file is reported with the server's reason, and the other files still go through", async () => {
    let n = 0
    mockApi({ "POST /import": () => (++n === 1 ? respond(403, { error: "Access denied: no permission to import" }) : { accountIban: "NL01", imported: 4, skipped: 0 }) })
    const { user } = renderApp(<ImportPanel />)
    await user.upload(fileInput(), [xml("denied.xml"), xml("fine.xml")])
    expect(await screen.findByText(/Access denied: no permission to import/)).toBeInTheDocument()
    await waitFor(() => expect(screen.getAllByText("Done")).toHaveLength(1))
    expect(screen.getByText("Error")).toBeInTheDocument()
  })

  /** The query keys that were invalidated, as strings like "accounts". */
  const invalidatedKeys = (spy: { mock: { calls: unknown[][] } }) =>
    spy.mock.calls.map(([arg]) => String((arg as { queryKey?: readonly unknown[] } | undefined)?.queryKey?.[0]))

  test("after a successful import the accounts, transactions and subscriptions are refreshed", async () => {
    mockApi({ "POST /import": { accountIban: "NL01", imported: 2, skipped: 0 } })
    const { user, client } = renderApp(<ImportPanel />)
    const spy = spyOn(client, "invalidateQueries")
    await user.upload(fileInput(), xml("s.xml"))
    await screen.findByText("Done")
    expect(invalidatedKeys(spy).sort()).toEqual(["accounts", "subscriptions", "transactions"])
  })

  test("importing a file that only had duplicates does not refresh anything", async () => {
    mockApi({ "POST /import": { accountIban: "NL01", imported: 0, skipped: 9 } })
    const { user, client } = renderApp(<ImportPanel />)
    const spy = spyOn(client, "invalidateQueries")
    await user.upload(fileInput(), xml("again.xml"))
    await screen.findByText("Done")
    expect(spy).not.toHaveBeenCalled()
  })

  test("the drop zone invites files and only accepts XML and ZIP", () => {
    renderApp(<ImportPanel />)
    expect(screen.getByText(/Drag & drop CAMT\.053 XML or ZIP files here/)).toBeInTheDocument()
    expect(fileInput()).toHaveAttribute("accept", ".xml,.zip")
    expect(fileInput()).toHaveAttribute("multiple")
  })
})
