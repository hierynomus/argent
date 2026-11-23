import { afterEach, describe, expect, test } from "vitest"
import { mockApi, respond } from "../../../test/fakeApi"
import { renderApp, screen, waitFor } from "../../../test/render"
import App from "../../App.vue"
import SecurityTab from "../settings/SecurityTab.vue"

const asLocal = () => ((window as any).__ENV__ = { VITE_AUTH_MODE: "local" })
afterEach(() => delete (window as any).__ENV__)

describe("the app gate (standalone)", () => {
  test("a locked app shows only the unlock screen and never asks for data", async () => {
    asLocal()
    const api = mockApi({ "GET /local/auth/status": { passwordSet: true, unlocked: false } })
    await renderApp(App)
    expect(await screen.findByText("Argent is locked")).toBeInTheDocument()
    expect(api.calls("GET", "/accounts")).toHaveLength(0)
    expect(api.unmatched).toHaveLength(0)
  })

  test("a wrong password shows the server's message and stays locked", async () => {
    asLocal()
    mockApi({ "GET /local/auth/status": { passwordSet: true, unlocked: false }, "POST /local/auth/unlock": respond(401, { error: "Wrong password" }) })
    const { user } = await renderApp(App)
    await user.type(await screen.findByLabelText("Password"), "nope")
    await user.click(screen.getByRole("button", { name: "Unlock" }))
    expect(await screen.findByText("Wrong password")).toBeInTheDocument()
    expect(screen.getByText("Argent is locked")).toBeInTheDocument()
  })

  test("the right password opens the app", async () => {
    asLocal()
    const api = mockApi({
      "GET /local/auth/status": { passwordSet: true, unlocked: false },
      "POST /local/auth/unlock": { passwordSet: true, unlocked: true },
    })
    const { user } = await renderApp(App)
    await user.type(await screen.findByLabelText("Password"), "right one")
    await user.click(screen.getByRole("button", { name: "Unlock" }))
    await waitFor(() => expect(screen.queryByText("Argent is locked")).not.toBeInTheDocument())
    expect(api.calls("POST", "/local/auth/unlock")[0].body).toEqual({ password: "right one" })
  })

  test("without a password there is no lock screen", async () => {
    asLocal()
    mockApi({ "GET /local/auth/status": { passwordSet: false, unlocked: true } })
    await renderApp(App)
    await waitFor(() => expect(screen.queryByText("Loading…")).not.toBeInTheDocument())
    expect(screen.queryByText("Argent is locked")).not.toBeInTheDocument()
  })

  test("an empty password is refused before asking the server", async () => {
    asLocal()
    const api = mockApi({ "GET /local/auth/status": { passwordSet: true, unlocked: false } })
    const { user } = await renderApp(App)
    await user.click(await screen.findByRole("button", { name: "Unlock" }))
    expect(await screen.findByText("Enter the password")).toBeInTheDocument()
    expect(api.calls("POST", "/local/auth/unlock")).toHaveLength(0)
  })
})

describe("Settings → Security", () => {
  test("sets a first password, only when both entries agree", async () => {
    const api = mockApi({ "GET /local/auth/status": { passwordSet: false, unlocked: true }, "PUT /local/auth/password": { passwordSet: true, unlocked: true } })
    const { user } = await renderApp(SecurityTab)
    await user.type(await screen.findByLabelText("Password"), "a good password")
    await user.type(screen.getByLabelText("Repeat the password"), "another one")
    await user.click(screen.getByRole("button", { name: "Set password" }))
    expect(await screen.findByText(/not the same/)).toBeInTheDocument()
    expect(api.calls("PUT", "/local/auth/password")).toHaveLength(0)

    await user.clear(screen.getByLabelText("Repeat the password"))
    await user.type(screen.getByLabelText("Repeat the password"), "a good password")
    await user.click(screen.getByRole("button", { name: "Set password" }))
    await waitFor(() => expect(api.calls("PUT", "/local/auth/password")).toHaveLength(1))
    expect(api.calls("PUT", "/local/auth/password")[0].body).toMatchObject({ password: "a good password" })
  })

  test("a short password is refused", async () => {
    const api = mockApi({ "GET /local/auth/status": { passwordSet: false, unlocked: true } })
    const { user } = await renderApp(SecurityTab)
    await user.type(await screen.findByLabelText("Password"), "short")
    await user.click(screen.getByRole("button", { name: "Set password" }))
    expect(await screen.findByText(/at least 8/)).toBeInTheDocument()
    expect(api.calls("PUT", "/local/auth/password")).toHaveLength(0)
  })

  test("changing sends the current password too", async () => {
    const api = mockApi({ "GET /local/auth/status": { passwordSet: true, unlocked: true }, "PUT /local/auth/password": { passwordSet: true, unlocked: true } })
    const { user } = await renderApp(SecurityTab)
    await user.type(await screen.findByLabelText("Current password"), "old password")
    await user.type(screen.getByLabelText("New password"), "new password")
    await user.type(screen.getByLabelText("Repeat the password"), "new password")
    await user.click(screen.getAllByRole("button", { name: "Change password" }).at(-1)!)
    await waitFor(() => expect(api.calls("PUT", "/local/auth/password")[0]?.body).toEqual({ password: "new password", currentPassword: "old password" }))
  })

  test("removing needs the current password", async () => {
    const api = mockApi({ "GET /local/auth/status": { passwordSet: true, unlocked: true }, "POST /local/auth/password/remove": { passwordSet: false, unlocked: true } })
    const { user } = await renderApp(SecurityTab)
    await user.click(await screen.findByRole("button", { name: "Remove password" }))
    await user.click(screen.getAllByRole("button", { name: "Remove password" }).at(-1)!)
    expect(await screen.findByText("Enter the current password")).toBeInTheDocument()
    await user.type(screen.getByLabelText("Current password"), "old password")
    await user.click(screen.getAllByRole("button", { name: "Remove password" }).at(-1)!)
    await waitFor(() => expect(api.calls("POST", "/local/auth/password/remove")[0].body).toEqual({ currentPassword: "old password" }))
  })

  test("Lock now locks", async () => {
    const api = mockApi({ "GET /local/auth/status": { passwordSet: true, unlocked: true }, "POST /local/auth/lock": { passwordSet: true, unlocked: false } })
    const { user } = await renderApp(SecurityTab)
    await user.click(await screen.findByRole("button", { name: "Lock now" }))
    await waitFor(() => expect(api.calls("POST", "/local/auth/lock")).toHaveLength(1))
  })
})
