import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { mockApi } from "../../test/fakeApi"
import { me } from "../../test/fixtures"
import { createFakeAuth } from "../auth"
import { renderApp, screen, waitFor } from "../../test/render"
import Layout from "./Layout.vue"

const authWithEmail = (email: string, signoutRedirect = async () => {}) =>
  createFakeAuth({ user: { access_token: "t", profile: { email } }, signoutRedirect })

async function mount(route = "/dashboard", auth = authWithEmail("fallback@x.nl")) {
  return renderApp(Layout, {
    route,
    auth,
    slots: { default: "<div>page body</div>" },
    routes: [{ path: "/profile", component: { template: "<div>profile page</div>" } }],
  })
}
const hrefs = () => screen.getAllByRole("link").map((l) => l.getAttribute("href"))
const link = (href: string) => screen.getAllByRole("link").find((l) => l.getAttribute("href") === href)!

beforeEach(() => {
  localStorage.clear()
  document.documentElement.classList.remove("dark")
})
afterEach(() => {
  localStorage.clear()
  document.documentElement.classList.remove("dark")
})

describe("Layout: navigation", () => {
  test("renders its children and the product name", async () => {
    mockApi({ "GET /me": me() })
    await mount()
    expect(await screen.findByText("page body")).toBeInTheDocument()
    expect(screen.getByText("Argent")).toBeInTheDocument()
  })

  test("links every section of the app", async () => {
    mockApi({ "GET /me": me() })
    await mount()
    await screen.findByText("page body")
    for (const to of ["/dashboard", "/checking", "/savings", "/overview", "/subscriptions", "/settings", "/mortgages", "/loans", "/crypto", "/metals", "/stocks", "/property", "/equity", "/pensions"]) {
      expect(hrefs()).toContain(to)
    }
  })

  test("section headings group the navigation", async () => {
    mockApi({ "GET /me": me() })
    await mount()
    expect(await screen.findByText("Banking")).toBeInTheDocument()
    expect(screen.getByText("Liabilities")).toBeInTheDocument()
    expect(screen.getByText("Investments")).toBeInTheDocument()
  })

  test("the current page's link is highlighted", async () => {
    mockApi({ "GET /me": me() })
    await mount("/loans")
    await screen.findByText("page body")
    expect(link("/loans").className).toContain("bg-indigo-50")
    expect(link("/crypto").className).not.toContain("bg-indigo-50")
  })

  test("Settings is the one configuration link: no Admin or Profile in the sidebar", async () => {
    mockApi({ "GET /me": me({ isAdmin: true }) })
    await mount()
    await screen.findByText("page body")
    expect(hrefs()).toContain("/settings")
    expect(hrefs()).not.toContain("/admin")
    expect(hrefs()).not.toContain("/profile")
  })
})

describe("Layout: sidebar", () => {
  const aside = () => document.querySelector("aside") as HTMLElement

  test("starts expanded and collapses on request, remembering the choice", async () => {
    mockApi({ "GET /me": me() })
    const { user } = await mount()
    await screen.findByText("page body")
    expect(aside().style.width).toBe("220px")
    await user.click(screen.getByTitle("Collapse sidebar"))
    expect(aside().style.width).toBe("64px")
    expect(localStorage.getItem("sidebar")).toBe("collapsed")
    await user.click(screen.getByTitle("Expand sidebar"))
    expect(aside().style.width).toBe("220px")
    expect(localStorage.getItem("sidebar")).toBe("expanded")
  })

  test("a remembered collapsed state is restored", async () => {
    localStorage.setItem("sidebar", "collapsed")
    mockApi({ "GET /me": me() })
    await mount()
    await screen.findByText("page body")
    expect(aside().style.width).toBe("64px")
    expect(screen.getByTitle("Expand sidebar")).toBeInTheDocument()
  })

  test("collapsed items drop their text labels but keep a tooltip", async () => {
    localStorage.setItem("sidebar", "collapsed")
    mockApi({ "GET /me": me() })
    await mount()
    await screen.findByText("page body")
    expect(screen.queryByText("Mortgages")).not.toBeInTheDocument()
    expect(link("/mortgages")).toHaveAttribute("title", "Mortgages")
  })
})

describe("Layout: user menu", () => {
  test("shows the user's name (falling back to email, then the sign-in profile)", async () => {
    mockApi({ "GET /me": me({ name: "Ada Lovelace" }) })
    const first = await mount()
    expect(await screen.findByText("Ada Lovelace")).toBeInTheDocument()
    expect(screen.getByText("A")).toBeInTheDocument() // avatar initial
    first.unmount()
    mockApi({ "GET /me": me({ name: "", email: "only@mail.nl" }) })
    const second = await mount()
    expect(await screen.findByText("only@mail.nl")).toBeInTheDocument()
    second.unmount()
    mockApi({ "GET /me": { ...me(), name: "", email: "" } })
    await mount("/dashboard", authWithEmail("oidc@x.nl"))
    expect(await screen.findByText("oidc@x.nl")).toBeInTheDocument()
  })

  test("the menu opens on click and closes when clicking elsewhere", async () => {
    mockApi({ "GET /me": me({ name: "Ada" }) })
    const { user } = await mount()
    await user.click(await screen.findByText("Ada"))
    expect(screen.getByRole("button", { name: "Sign out" })).toBeInTheDocument()
    await user.click(screen.getByText("page body"))
    await waitFor(() => expect(screen.queryByRole("button", { name: "Sign out" })).not.toBeInTheDocument())
  })

  test("Profile navigates there and closes the menu", async () => {
    mockApi({ "GET /me": me({ name: "Ada" }) })
    const { user, router } = await mount()
    await user.click(await screen.findByText("Ada"))
    await user.click(screen.getByRole("button", { name: "Profile" }))
    await waitFor(() => expect(router.currentRoute.value.path).toBe("/profile"))
    expect(screen.queryByRole("button", { name: "Sign out" })).not.toBeInTheDocument()
  })

  test("Sign out ends the OIDC session", async () => {
    const signoutRedirect = vi.fn(async () => {})
    mockApi({ "GET /me": me({ name: "Ada" }) })
    const { user } = await mount("/dashboard", authWithEmail("x@y.nl", signoutRedirect))
    await user.click(await screen.findByText("Ada"))
    await user.click(screen.getByRole("button", { name: "Sign out" }))
    expect(signoutRedirect).toHaveBeenCalledTimes(1)
  })
})

describe("Layout: theme", () => {
  test("the dark theme adds the dark class to <html>", async () => {
    mockApi({ "GET /me": me({ theme: "dark" }) })
    await mount()
    await waitFor(() => expect(document.documentElement.classList.contains("dark")).toBe(true))
  })

  test("the light theme removes it", async () => {
    document.documentElement.classList.add("dark")
    mockApi({ "GET /me": me({ theme: "light" }) })
    await mount()
    await waitFor(() => expect(document.documentElement.classList.contains("dark")).toBe(false))
  })

  test("'system' follows the operating system preference", async () => {
    const original = window.matchMedia
    window.matchMedia = ((q: string) => ({ matches: q.includes("dark"), media: q, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false })) as typeof window.matchMedia
    try {
      mockApi({ "GET /me": me({ theme: "system" }) })
      await mount()
      await waitFor(() => expect(document.documentElement.classList.contains("dark")).toBe(true))
    } finally {
      window.matchMedia = original
    }
  })
})

describe("Layout: standalone menu", () => {
  const local = () => ((window as any).__ENV__ = { VITE_AUTH_MODE: "local" })
  afterEach(() => delete (window as any).__ENV__)

  test("has Lock instead of Sign out, enabled once a password is set", async () => {
    local()
    const api = mockApi({ "GET /me": me(), "GET /local/auth/status": { passwordSet: true, unlocked: true }, "POST /local/auth/lock": { passwordSet: true, unlocked: false } })
    const { user } = await mount()
    await user.click(await screen.findByRole("button", { name: /Dev User/ }))
    expect(screen.queryByRole("button", { name: "Sign out" })).not.toBeInTheDocument()
    const lock = await screen.findByRole("button", { name: "Lock" })
    await waitFor(() => expect(lock).toBeEnabled())
    await user.click(lock)
    await waitFor(() => expect(api.calls("POST", "/local/auth/lock")).toHaveLength(1))
  })

  test("Lock is disabled while there is no password", async () => {
    local()
    mockApi({ "GET /me": me(), "GET /local/auth/status": { passwordSet: false, unlocked: true } })
    const { user } = await mount()
    await user.click(await screen.findByRole("button", { name: /Dev User/ }))
    expect(await screen.findByRole("button", { name: "Lock" })).toBeDisabled()
  })
})
