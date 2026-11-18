import { describe, expect, test } from "vitest"
import { mockApi } from "../../test/fakeApi"
import { account, me } from "../../test/fixtures"
import { renderApp, screen, waitFor } from "../../test/render"
import AdminPage from "./Admin.vue"

const adminAccounts = [{ ...account({ id: "a1", name: "Everyday", iban: "NL01CHEK0000000001" }), members: [{ groupName: "family", role: "editor" }], ownerProfile: null }]
const sharing = {
  portfolios: [{ id: "p1", name: "Retirement", type: "stocks", members: [{ groupName: "family", role: "editor" }, { groupName: "friends", role: "viewer" }] }],
  mortgages: [{ id: "m1", name: "House", members: [{ groupName: "family", role: "viewer" }] }],
  loans: [],
  properties: [{ id: "pr1", name: "Our flat", members: [{ groupName: "family", role: "viewer" }] }],
}

const setup = async (profile = me({ isAdmin: true })) => {
  const api = mockApi({ "GET /me": profile, "GET /admin/accounts": adminAccounts, "GET /admin/sharing": sharing })
  return { api, ...await renderApp(AdminPage) }
}

describe("Admin: access", () => {
  test("a non-admin sees a 403 page and the admin endpoints are never called", async () => {
    const { api } = await setup(me({ isAdmin: false }))
    expect(await screen.findByText(/403 — Forbidden/)).toBeInTheDocument()
    expect(screen.getByText("You do not have admin access.")).toBeInTheDocument()
    await new Promise((r) => setTimeout(r, 30))
    expect(api.calls().filter((c) => c.path.startsWith("/admin"))).toHaveLength(0)
  })

  test("an admin sees the administration page", async () => {
    await setup()
    expect(await screen.findByRole("heading", { name: "Administration" })).toBeInTheDocument()
  })
})

describe("Admin: tabs", () => {
  test("opens on 'Accounts & Permissions' with each account's groups", async () => {
    await setup()
    expect(await screen.findByText("NL01CHEK0000000001")).toBeInTheDocument()
    expect(screen.getByText("family")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Accounts & Permissions/ })).toHaveAttribute("aria-pressed", "true")
  })

  test("says so when there are no accounts", async () => {
    mockApi({ "GET /me": me({ isAdmin: true }), "GET /admin/accounts": [] })
    await renderApp(AdminPage)
    expect(await screen.findByText("No accounts yet.")).toBeInTheDocument()
  })

  test("the sharing overview is only fetched when its tab is opened", async () => {
    const { api, user } = await setup()
    await screen.findByText("NL01CHEK0000000001")
    expect(api.calls("GET", "/admin/sharing")).toHaveLength(0)
    await user.click(screen.getByRole("button", { name: "Sharing Overview" }))
    expect(await screen.findByText("Retirement")).toBeInTheDocument()
    expect(api.calls("GET", "/admin/sharing")).toHaveLength(1)
  })

  test("sharing overview lists portfolios and mortgages with each group's role", async () => {
    const { user } = await setup()
    await user.click(await screen.findByRole("button", { name: "Sharing Overview" }))
    expect(await screen.findByText("Retirement")).toBeInTheDocument()
    expect(screen.getByText("stocks")).toBeInTheDocument()
    expect(screen.getByText("friends")).toBeInTheDocument()
    expect(screen.getByText("House")).toBeInTheDocument()
    expect(screen.getByText("Portfolios")).toBeInTheDocument()
    expect(screen.getByText("Property")).toBeInTheDocument()
    expect(screen.getByText("Our flat")).toBeInTheDocument()
  })

  test("an empty sharing overview explains itself", async () => {
    mockApi({ "GET /me": me({ isAdmin: true }), "GET /admin/accounts": [], "GET /admin/sharing": { portfolios: [], mortgages: [], loans: [], properties: [] } })
    const { user } = await renderApp(AdminPage)
    await user.click(await screen.findByRole("button", { name: "Sharing Overview" }))
    expect(await screen.findByText("No resources are shared with groups yet.")).toBeInTheDocument()
  })

  test("the backup tab shows download and restore", async () => {
    const { user } = await setup()
    await user.click(await screen.findByRole("button", { name: /Backup & Restore/ }))
    expect(screen.getByRole("button", { name: "Download" })).toBeInTheDocument()
    expect(screen.getByText("Restore from backup")).toBeInTheDocument()
  })

  test("changing an account's access refreshes the account list", async () => {
    const api = mockApi({
      "GET /me": me({ isAdmin: true }), "GET /admin/accounts": adminAccounts,
      "POST /admin/accounts/:id/members": ({ body }: any) => body,
    })
    const { user } = await renderApp(AdminPage)
    await user.click(await screen.findByRole("button", { name: "+ Add group" }))
    const before = api.calls("GET", "/admin/accounts").length
    await user.type(screen.getByLabelText("Group name"), "newgroup")
    await user.click(screen.getByRole("button", { name: "Add" }))
    await waitFor(() => expect(api.calls("POST", "/admin/accounts/a1/members")).toHaveLength(1))
    await waitFor(() => expect(api.calls("GET", "/admin/accounts").length).toBeGreaterThan(before))
  })
})
