import { describe, expect, test } from "bun:test"
import { mockApi, respond } from "../../test/fakeApi"
import { me } from "../../test/fixtures"
import { renderApp, screen, waitFor } from "../../test/render"
import ProfilePage from "./Profile"

const setup = (profile = me(), extra: Record<string, any> = {}) => {
  const api = mockApi({ "GET /me": profile, "PATCH /me": ({ body }: any) => ({ ...profile, ...body }), ...extra })
  return { api, ...renderApp(<ProfilePage />) }
}

describe("Profile", () => {
  test("shows the signed-in user's name and email", async () => {
    setup()
    expect(await screen.findByText("Dev User")).toBeInTheDocument()
    expect(screen.getByText("dev@localhost")).toBeInTheDocument()
  })

  test("missing name/email are shown as 'Not set'", async () => {
    setup(me({ name: null as any, email: null as any }))
    expect(await screen.findAllByText("Not set")).toHaveLength(2)
  })

  test("shows the user's roles", async () => {
    setup(me({ isAdmin: true, canImport: true }))
    expect(await screen.findByText("Admin")).toBeInTheDocument()
    expect(screen.getByText("Import")).toBeInTheDocument()
  })

  test("an importer who is not an admin", async () => {
    setup(me({ isAdmin: false, canImport: true }))
    await screen.findByText("Import")
    expect(screen.queryByText("Admin")).not.toBeInTheDocument()
  })

  test("a user with neither right is just a viewer", async () => {
    setup(me({ isAdmin: false, canImport: false }))
    expect(await screen.findByText("Viewer")).toBeInTheDocument()
  })

  test("the current theme is the pressed button (system when none is set)", async () => {
    setup(me({ theme: "dark" }))
    expect(await screen.findByRole("button", { name: /Dark/ })).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByRole("button", { name: /Light/ })).toHaveAttribute("aria-pressed", "false")
    expect(screen.getByRole("button", { name: /System/ })).toHaveAttribute("aria-pressed", "false")
  })

  test("choosing a theme saves it, and the new choice shows as pressed", async () => {
    const { api, user } = setup(me({ theme: "system" }))
    await user.click(await screen.findByRole("button", { name: /Light/ }))
    await waitFor(() => expect(api.calls("PATCH", "/me")).toHaveLength(1))
    expect(api.calls("PATCH", "/me")[0].body).toEqual({ theme: "light" })
    await waitFor(() => expect(screen.getByRole("button", { name: /Light/ })).toHaveAttribute("aria-pressed", "true"))
    expect(screen.getByRole("button", { name: /System/ })).toHaveAttribute("aria-pressed", "false")
  })

  test("a failed save is reported and the previous theme stays selected", async () => {
    const { user } = setup(me({ theme: "system" }), { "PATCH /me": respond(500, { error: "Internal server error" }) })
    await user.click(await screen.findByRole("button", { name: /Dark/ }))
    expect(await screen.findByText("Internal server error")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /System/ })).toHaveAttribute("aria-pressed", "true")
  })
})
