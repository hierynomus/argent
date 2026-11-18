import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test"
import { mockApi, respond } from "../../../test/fakeApi"
import { renderApp, screen, waitFor } from "../../../test/render"
import { BackupRestoreSection } from "./BackupRestoreSection"

const backupFile = (content: string, name = "argent-backup.json") => new File([content], name, { type: "application/json" })
const fileInput = () => screen.getByLabelText("Backup file")

describe("BackupRestoreSection: download", () => {
  const created: string[] = []
  const clicks: Array<{ href: string; download: string }> = []
  let click: ReturnType<typeof spyOn>

  beforeEach(() => {
    // happy-dom has no object URLs; give the component something to call
    ;(URL as any).createObjectURL = () => { const u = `blob:test/${created.length}`; created.push(u); return u }
    ;(URL as any).revokeObjectURL = () => {}
    click = spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) { clicks.push({ href: this.href, download: this.download }) })
  })
  afterEach(() => { click.mockRestore(); created.length = 0; clicks.length = 0 })

  test("downloads the backup under the filename the server suggests", async () => {
    const orig = globalThis.fetch
    globalThis.fetch = (async () =>
      new Response('{"version":1}', { headers: { "Content-Disposition": 'attachment; filename="argent-backup-2026-11-18.json"' } })) as unknown as typeof fetch
    try {
      const { user } = renderApp(<BackupRestoreSection />)
      await user.click(screen.getByRole("button", { name: "Download" }))
      await waitFor(() => expect(clicks).toHaveLength(1))
      expect(clicks[0].download).toBe("argent-backup-2026-11-18.json")
      expect(clicks[0].href).toStartWith("blob:")
    } finally {
      globalThis.fetch = orig
    }
  })

  test("a failed download is reported", async () => {
    const orig = globalThis.fetch
    globalThis.fetch = (async () => new Response("nope", { status: 403 })) as unknown as typeof fetch
    try {
      const { user } = renderApp(<BackupRestoreSection />)
      await user.click(screen.getByRole("button", { name: "Download" }))
      expect(await screen.findByText("Download failed")).toBeInTheDocument()
      expect(clicks).toHaveLength(0)
    } finally { globalThis.fetch = orig }
  })
})

describe("BackupRestoreSection: restore", () => {
  const setup = (extra: Record<string, any> = {}) => {
    const api = mockApi({ "POST /admin/restore": { ok: true, restored: { accounts: 3, transactions: 120 } }, ...extra })
    return { api, ...renderApp(<BackupRestoreSection />) }
  }

  test("warns that restoring replaces everything, and offers nothing until a file is chosen", () => {
    setup()
    expect(screen.getByText(/permanently replace all existing data/)).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Restore" })).not.toBeInTheDocument()
  })

  test("needs an explicit confirmation naming the file; nothing is sent before that", async () => {
    const { api, user } = setup()
    await user.upload(fileInput(), backupFile('{"version":1}', "my-backup.json"))
    await user.click(screen.getByRole("button", { name: "Restore" }))
    expect(screen.getByRole("alertdialog", { name: "Confirm restore" })).toHaveTextContent("my-backup.json")
    expect(api.calls("POST", "/admin/restore")).toHaveLength(0)
  })

  test("Cancel backs out of the confirmation and keeps the file selected", async () => {
    const { api, user } = setup()
    await user.upload(fileInput(), backupFile('{"version":1}'))
    await user.click(screen.getByRole("button", { name: "Restore" }))
    await user.click(screen.getByRole("button", { name: "Cancel" }))
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Restore" })).toBeInTheDocument()
    expect(api.calls("POST")).toHaveLength(0)
  })

  test("confirming sends the parsed backup and shows what was restored", async () => {
    const { api, user } = setup()
    await user.upload(fileInput(), backupFile('{"version":1,"accounts":[{"id":"a"}]}'))
    await user.click(screen.getByRole("button", { name: "Restore" }))
    await user.click(screen.getByRole("button", { name: "Yes, replace all data" }))
    expect(await screen.findByText("Restore complete")).toBeInTheDocument()
    expect(screen.getByText("accounts: 3")).toBeInTheDocument()
    expect(screen.getByText("transactions: 120")).toBeInTheDocument()
    expect(api.calls("POST", "/admin/restore")[0].body).toEqual({ version: 1, accounts: [{ id: "a" }] })
    expect(screen.queryByRole("button", { name: "Restore" })).not.toBeInTheDocument() // the file was consumed
  })

  test("after a restore every cached query is invalidated (the data on screen is all stale)", async () => {
    const { user, client } = setup()
    const spy = spyOn(client, "invalidateQueries")
    await user.upload(fileInput(), backupFile('{"version":1}'))
    await user.click(screen.getByRole("button", { name: "Restore" }))
    await user.click(screen.getByRole("button", { name: "Yes, replace all data" }))
    await screen.findByText("Restore complete")
    expect(spy).toHaveBeenCalledWith() // no filter = everything
  })

  test("a file that is not JSON is rejected with a clear message, without calling the API", async () => {
    const { api, user } = setup()
    await user.upload(fileInput(), backupFile("this is not json"))
    await user.click(screen.getByRole("button", { name: "Restore" }))
    await user.click(screen.getByRole("button", { name: "Yes, replace all data" }))
    expect(await screen.findByText(/not valid JSON/)).toBeInTheDocument()
    expect(api.calls("POST")).toHaveLength(0)
  })

  test("a server rejection is shown (and nothing is claimed restored)", async () => {
    const { user } = setup({ "POST /admin/restore": respond(400, { error: "Unsupported backup version" }) })
    await user.upload(fileInput(), backupFile('{"version":9}'))
    await user.click(screen.getByRole("button", { name: "Restore" }))
    await user.click(screen.getByRole("button", { name: "Yes, replace all data" }))
    expect(await screen.findByText("Unsupported backup version")).toBeInTheDocument()
    expect(screen.queryByText("Restore complete")).not.toBeInTheDocument()
  })

  test("choosing another file clears the previous result or error", async () => {
    const { user } = setup({ "POST /admin/restore": respond(400, { error: "Unsupported backup version" }) })
    await user.upload(fileInput(), backupFile('{"version":9}'))
    await user.click(screen.getByRole("button", { name: "Restore" }))
    await user.click(screen.getByRole("button", { name: "Yes, replace all data" }))
    await screen.findByText("Unsupported backup version")
    await user.upload(fileInput(), backupFile('{"version":1}', "other.json"))
    expect(screen.queryByText("Unsupported backup version")).not.toBeInTheDocument()
  })
})
