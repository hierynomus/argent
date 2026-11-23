import { afterEach, describe, expect, test } from "vitest"
import { mockApi, respond } from "../../../test/fakeApi"
import { renderApp, screen, waitFor } from "../../../test/render"
import BackupRestoreSection from "./BackupRestoreSection.vue"

const settings = { backupDir: "/data/backups", defaultBackupDir: "/data/backups", configFile: "/cfg/config.json", dataDir: "/data" }

afterEach(() => { delete (window as any).__ENV__ })

describe("Backup & Restore in the desktop app", () => {
  test("a browser still gets the download button, not the folder", async () => {
    await renderApp(BackupRestoreSection)
    expect(screen.getByRole("button", { name: "Download" })).toBeInTheDocument()
    expect(screen.queryByLabelText("Backup folder")).toBeNull()
  })

  test("shows the current folder and where the choice is kept", async () => {
    ;(window as any).__ENV__ = { VITE_AUTH_MODE: "local" }
    mockApi({ "GET /local/settings": settings })
    await renderApp(BackupRestoreSection)
    await waitFor(() => expect(screen.getByLabelText("Backup folder")).toHaveValue("/data/backups"))
    expect(screen.getByText("/cfg/config.json")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Download" })).toBeNull()
  })

  test("backs up into the folder and shows the file", async () => {
    ;(window as any).__ENV__ = { VITE_AUTH_MODE: "local" }
    const api = mockApi({ "GET /local/settings": settings, "POST /local/backup": { path: "/data/backups/argent-backup-2026-11-23-0915.json", bytes: 123 } })
    const { user } = await renderApp(BackupRestoreSection)
    await user.click(await screen.findByRole("button", { name: "Back up now" }))
    expect(await screen.findByText("Saved to /data/backups/argent-backup-2026-11-23-0915.json")).toBeInTheDocument()
    expect(api.calls("POST", "/local/backup")).toHaveLength(1)
  })

  test("chooses another folder; a refusal from the server is shown", async () => {
    ;(window as any).__ENV__ = { VITE_AUTH_MODE: "local" }
    const api = mockApi({
      "GET /local/settings": settings,
      "PUT /local/settings": ({ body }: any) => (body.backupDir.startsWith("/proc") ? respond(400, { error: "Cannot write to /proc/x: ENOENT" }) : { ...settings, backupDir: body.backupDir }),
    })
    const { user } = await renderApp(BackupRestoreSection)
    const input = await screen.findByLabelText("Backup folder")
    await waitFor(() => expect(input).toHaveValue("/data/backups"))
    expect(screen.getByRole("button", { name: "Use this folder" })).toBeDisabled() // nothing changed yet
    await user.clear(input)
    await user.type(input, "/proc/x")
    await user.click(screen.getByRole("button", { name: "Use this folder" }))
    expect(await screen.findByText(/Cannot write to \/proc\/x/)).toBeInTheDocument()
    await user.clear(input)
    await user.type(input, "/home/me/Backups")
    await user.click(screen.getByRole("button", { name: "Use this folder" }))
    await waitFor(() => expect(api.calls("PUT", "/local/settings").at(-1)?.body).toEqual({ backupDir: "/home/me/Backups" }))
  })

  test("an empty folder is explained before anything is sent", async () => {
    ;(window as any).__ENV__ = { VITE_AUTH_MODE: "local" }
    const api = mockApi({ "GET /local/settings": settings })
    const { user } = await renderApp(BackupRestoreSection)
    const input = await screen.findByLabelText("Backup folder")
    await waitFor(() => expect(input).toHaveValue("/data/backups"))
    await user.clear(input)
    await user.type(input, " ")
    await user.click(screen.getByRole("button", { name: "Use this folder" }))
    expect(await screen.findByText("Enter a folder")).toBeInTheDocument()
    expect(api.calls("PUT", "/local/settings")).toHaveLength(0)
  })
})
