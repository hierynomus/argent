import { describe, expect, test } from "vitest"
import { mockApi } from "../../test/fakeApi"
import { account, me } from "../../test/fixtures"
import { renderApp, screen, waitFor } from "../../test/render"
import SettingsPage from "./Settings.vue"

const adminAccounts = [{ ...account({ id: "a1", name: "Everyday", iban: "NL01CHEK0000000001" }), members: [{ groupName: "family", role: "editor" }], ownerProfile: null }]
const sharing = {
  portfolios: [{ id: "p1", name: "Retirement", type: "stocks", members: [{ groupName: "family", role: "editor" }, { groupName: "friends", role: "viewer" }] }],
  mortgages: [{ id: "m1", name: "House", members: [{ groupName: "family", role: "viewer" }] }],
  loans: [],
  properties: [{ id: "pr1", name: "Our flat", members: [{ groupName: "family", role: "viewer" }] }],
  equity: [{ id: "eq1", name: "Acme BV", members: [{ groupName: "family", role: "editor" }] }],
}

const setup = async (profile = me({ isAdmin: true }), route = "/settings?tab=access") => {
  const api = mockApi({ "GET /me": profile, "GET /accounts": [], "GET /admin/accounts": adminAccounts, "GET /admin/sharing": sharing })
  return { api, ...await renderApp(SettingsPage, { route }) }
}

describe("Settings: admin tabs", () => {
  test("a non-admin gets no admin tabs and the admin endpoints are never called", async () => {
    const { api } = await setup(me({ isAdmin: false }))
    expect(await screen.findByRole("button", { name: "Accounts" })).toBeInTheDocument()
    for (const name of ["Access", "Sharing", "Backup & Restore"]) expect(screen.queryByRole("button", { name })).not.toBeInTheDocument()
    await new Promise((r) => setTimeout(r, 30))
    expect(api.calls().filter((c) => c.path.startsWith("/admin"))).toHaveLength(0)
  })

  test("an admin gets Access, Sharing and Backup & Restore next to the account settings", async () => {
    await setup()
    for (const name of ["Accounts", "Labels", "Access", "Sharing", "Backup & Restore"]) expect(await screen.findByRole("button", { name })).toBeInTheDocument()
  })

  test("the old /admin address lands on Access", async () => {
    const { router } = await setup(me({ isAdmin: true }), "/settings?tab=access")
    expect(router.currentRoute.value.query.tab).toBe("access")
  })

  test("the standalone app has no groups, so no Access or Sharing, but it keeps Backup & Restore", async () => {
    ;(window as any).__ENV__ = { VITE_AUTH_MODE: "local" }
    try {
      await setup(me({ isAdmin: true }), "/settings")
      expect(await screen.findByRole("button", { name: "Backup & Restore" })).toBeInTheDocument()
      expect(screen.queryByRole("button", { name: "Access" })).not.toBeInTheDocument()
      expect(screen.queryByRole("button", { name: "Sharing" })).not.toBeInTheDocument()
    } finally {
      delete (window as any).__ENV__
    }
  })
})

describe("Settings: access and sharing", () => {
  test("Access lists each account with its groups", async () => {
    await setup()
    expect(await screen.findByText("NL01CHEK0000000001")).toBeInTheDocument()
    expect(screen.getByText("family")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Access" })).toHaveAttribute("aria-pressed", "true")
  })

  test("says so when there are no accounts", async () => {
    mockApi({ "GET /me": me({ isAdmin: true }), "GET /accounts": [], "GET /admin/accounts": [] })
    await renderApp(SettingsPage, { route: "/settings?tab=access" })
    expect(await screen.findByText("No accounts yet.")).toBeInTheDocument()
  })

  test("the sharing overview is only fetched when its tab is opened", async () => {
    const { api, user } = await setup()
    await screen.findByText("NL01CHEK0000000001")
    expect(api.calls("GET", "/admin/sharing")).toHaveLength(0)
    await user.click(screen.getByRole("button", { name: "Sharing" }))
    expect(await screen.findByText("Retirement")).toBeInTheDocument()
    expect(api.calls("GET", "/admin/sharing")).toHaveLength(1)
  })

  test("sharing overview lists portfolios and mortgages with each group's role", async () => {
    const { user } = await setup()
    await user.click(await screen.findByRole("button", { name: "Sharing" }))
    expect(await screen.findByText("Retirement")).toBeInTheDocument()
    expect(screen.getByText("stocks")).toBeInTheDocument()
    expect(screen.getByText("friends")).toBeInTheDocument()
    expect(screen.getByText("House")).toBeInTheDocument()
    expect(screen.getByText("Portfolios")).toBeInTheDocument()
    expect(screen.getByText("Property")).toBeInTheDocument()
    expect(screen.getByText("Our flat")).toBeInTheDocument()
    expect(screen.getByText("Stock options")).toBeInTheDocument()
    expect(screen.getByText("Acme BV")).toBeInTheDocument()
  })

  test("an empty sharing overview explains itself", async () => {
    mockApi({ "GET /me": me({ isAdmin: true }), "GET /accounts": [], "GET /admin/accounts": [], "GET /admin/sharing": { portfolios: [], mortgages: [], loans: [], properties: [], equity: [] } })
    const { user } = await renderApp(SettingsPage, { route: "/settings?tab=access" })
    await user.click(await screen.findByRole("button", { name: "Sharing" }))
    expect(await screen.findByText("No resources are shared with groups yet.")).toBeInTheDocument()
  })

  test("the backup tab shows download and restore", async () => {
    const { user } = await setup()
    await user.click(await screen.findByRole("button", { name: "Backup & Restore" }))
    expect(screen.getByRole("button", { name: "Download" })).toBeInTheDocument()
    expect(screen.getByText("Restore from backup")).toBeInTheDocument()
  })

  test("changing an account's access refreshes the account list", async () => {
    const api = mockApi({
      "GET /me": me({ isAdmin: true }), "GET /accounts": [], "GET /admin/accounts": adminAccounts,
      "POST /admin/accounts/:id/members": ({ body }: any) => body,
    })
    const { user } = await renderApp(SettingsPage, { route: "/settings?tab=access" })
    await user.click(await screen.findByRole("button", { name: "+ Add group" }))
    const before = api.calls("GET", "/admin/accounts").length
    await user.type(screen.getByLabelText("Group name"), "newgroup")
    await user.click(screen.getByRole("button", { name: "Add" }))
    await waitFor(() => expect(api.calls("POST", "/admin/accounts/a1/members")).toHaveLength(1))
    await waitFor(() => expect(api.calls("GET", "/admin/accounts").length).toBeGreaterThan(before))
  })
})
