import { describe, expect, test } from "vitest"
import { mockApi } from "../../test/fakeApi"
import { account, category, me } from "../../test/fixtures"
import { renderApp, screen } from "../../test/render"
import SettingsPage from "./Settings.vue"

const setup = async (profile = me({ canImport: true }), route = "/settings") => {
  const api = mockApi({ "GET /me": profile, "GET /accounts": [account({ name: "Everyday" })], "GET /categories": [category({ name: "Groceries" })] })
  return { api, ...await renderApp(SettingsPage, { route }) }
}

describe("Settings: tabs", () => {
  test("opens on Accounts", async () => {
    await setup()
    expect(await screen.findByRole("heading", { name: "Settings" })).toBeInTheDocument()
    expect(await screen.findByText("Everyday")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Accounts" })).toHaveAttribute("aria-pressed", "true")
  })

  test("switches to Labels", async () => {
    const { user } = await setup()
    await user.click(await screen.findByRole("button", { name: "Labels" }))
    expect(await screen.findByText("Groceries")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Labels" })).toHaveAttribute("aria-pressed", "true")
    expect(screen.queryByText("Everyday")).not.toBeInTheDocument()
  })

  test("the chosen tab can be opened directly from the URL (?tab=)", async () => {
    await setup(me({ canImport: true }), "/settings?tab=labels")
    expect(await screen.findByText("Groceries")).toBeInTheDocument()
  })

  test("the Import tab exists only for users who may import", async () => {
    const { user, unmount } = await setup(me({ canImport: true }))
    await user.click(await screen.findByRole("button", { name: "Import" }))
    expect(await screen.findByText(/Drag & drop CAMT\.053/)).toBeInTheDocument()
    unmount()
    await setup(me({ canImport: false }))
    await screen.findByText("Everyday")
    expect(screen.queryByRole("button", { name: "Import" })).not.toBeInTheDocument()
  })

  test("a user without import rights who opens ?tab=import by URL gets nothing", async () => {
    await setup(me({ canImport: false }), "/settings?tab=import")
    await screen.findByRole("heading", { name: "Settings" })
    await new Promise((r) => setTimeout(r, 30))
    expect(screen.queryByText(/Drag & drop CAMT\.053/)).not.toBeInTheDocument()
  })
})
