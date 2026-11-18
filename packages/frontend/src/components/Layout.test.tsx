import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { AuthContext, type AuthContextProps } from "react-oidc-context"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { mockApi } from "../../test/fakeApi"
import { me } from "../../test/fixtures"
import { ApiAuthBridge } from "../api"
import Layout from "./Layout"

let signedOut = 0
const auth = (email = "fallback@x.nl"): AuthContextProps =>
  ({ isAuthenticated: true, isLoading: false, user: { access_token: "t", profile: { email } }, signoutRedirect: async () => { signedOut++ } }) as unknown as AuthContextProps

function mount(route = "/dashboard", authCtx = auth()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const user = userEvent.setup()
  const utils = render(
    <AuthContext.Provider value={authCtx}>
      <ApiAuthBridge>
        <QueryClientProvider client={client}>
          <MemoryRouter initialEntries={[route]}>
            <Layout>
              <Routes>
                <Route path="*" element={<div>page body</div>} />
                <Route path="/profile" element={<div>profile page</div>} />
              </Routes>
            </Layout>
          </MemoryRouter>
        </QueryClientProvider>
      </ApiAuthBridge>
    </AuthContext.Provider>,
  )
  return { user, client, ...utils }
}

beforeEach(() => { localStorage.clear(); document.documentElement.classList.remove("dark"); signedOut = 0 })
afterEach(() => { localStorage.clear(); document.documentElement.classList.remove("dark") })

describe("Layout: navigation", () => {
  test("renders its children and the product name", async () => {
    mockApi({ "GET /me": me() })
    mount()
    expect(await screen.findByText("page body")).toBeInTheDocument()
    expect(screen.getByText("Argent")).toBeInTheDocument()
  })

  test("links every section of the app", async () => {
    mockApi({ "GET /me": me() })
    mount()
    await screen.findByText("page body")
    // wait for the sidebar labels (they appear after the expand animation delay)
    const links = await screen.findAllByRole("link")
    const hrefs = links.map((l) => l.getAttribute("href"))
    for (const to of ["/dashboard", "/checking", "/savings", "/overview", "/subscriptions", "/settings", "/mortgages", "/loans", "/crypto", "/metals", "/stocks", "/profile"]) {
      expect(hrefs).toContain(to)
    }
  })

  test("section headings group the navigation", async () => {
    mockApi({ "GET /me": me() })
    mount()
    expect(await screen.findByText("Banking")).toBeInTheDocument()
    expect(screen.getByText("Liabilities")).toBeInTheDocument()
    expect(screen.getByText("Investments")).toBeInTheDocument()
  })

  test("the current page's link is highlighted", async () => {
    mockApi({ "GET /me": me() })
    mount("/loans")
    const loans = (await screen.findAllByRole("link")).find((l) => l.getAttribute("href") === "/loans")!
    expect(loans.className).toContain("bg-indigo-50")
    const crypto = (await screen.findAllByRole("link")).find((l) => l.getAttribute("href") === "/crypto")!
    expect(crypto.className).not.toContain("bg-indigo-50")
  })

  test("the Admin link is only for admins", async () => {
    mockApi({ "GET /me": me({ isAdmin: false }) })
    const { unmount } = mount()
    await screen.findByText("page body")
    await waitFor(() => expect(screen.queryAllByRole("link").some((l) => l.getAttribute("href") === "/admin")).toBe(false))
    unmount()
    mockApi({ "GET /me": me({ isAdmin: true }) })
    mount()
    await waitFor(() => expect(screen.getAllByRole("link").some((l) => l.getAttribute("href") === "/admin")).toBe(true))
  })
})

describe("Layout: sidebar", () => {
  test("starts expanded and collapses on request, remembering the choice", async () => {
    mockApi({ "GET /me": me() })
    const { user } = mount()
    await screen.findByText("page body")
    const aside = document.querySelector("aside") as HTMLElement
    expect(aside.style.width).toBe("220px")
    await user.click(screen.getByTitle("Collapse sidebar"))
    expect(aside.style.width).toBe("64px")
    expect(localStorage.getItem("sidebar")).toBe("collapsed")
    await user.click(screen.getByTitle("Expand sidebar"))
    expect(aside.style.width).toBe("220px")
    expect(localStorage.getItem("sidebar")).toBe("expanded")
  })

  test("a remembered collapsed state is restored", async () => {
    localStorage.setItem("sidebar", "collapsed")
    mockApi({ "GET /me": me() })
    mount()
    await screen.findByText("page body")
    expect((document.querySelector("aside") as HTMLElement).style.width).toBe("64px")
    expect(screen.getByTitle("Expand sidebar")).toBeInTheDocument()
  })

  test("collapsed items drop their text labels but keep a tooltip", async () => {
    localStorage.setItem("sidebar", "collapsed")
    mockApi({ "GET /me": me() })
    mount()
    await screen.findByText("page body")
    expect(screen.queryByText("Mortgages")).not.toBeInTheDocument()
    expect(screen.getAllByRole("link").find((l) => l.getAttribute("href") === "/mortgages")).toHaveAttribute("title", "Mortgages")
  })
})

describe("Layout: user menu", () => {
  test("shows the user's name (falling back to email, then the sign-in profile)", async () => {
    mockApi({ "GET /me": me({ name: "Ada Lovelace" }) })
    const first = mount()
    expect(await screen.findByText("Ada Lovelace")).toBeInTheDocument()
    expect(screen.getByText("A")).toBeInTheDocument() // avatar initial
    first.unmount()
    mockApi({ "GET /me": me({ name: "", email: "only@mail.nl" }) })
    const second = mount()
    expect(await screen.findByText("only@mail.nl")).toBeInTheDocument()
    second.unmount()
    mockApi({ "GET /me": { ...me(), name: "", email: "" } })
    mount("/dashboard", auth("oidc@x.nl"))
    expect(await screen.findByText("oidc@x.nl")).toBeInTheDocument()
  })

  test("the menu opens on click and closes when clicking elsewhere", async () => {
    mockApi({ "GET /me": me({ name: "Ada" }) })
    const { user } = mount()
    await user.click(await screen.findByText("Ada"))
    expect(screen.getByRole("button", { name: "Sign out" })).toBeInTheDocument()
    await user.click(screen.getByText("page body"))
    await waitFor(() => expect(screen.queryByRole("button", { name: "Sign out" })).not.toBeInTheDocument())
  })

  test("Profile navigates there and closes the menu", async () => {
    mockApi({ "GET /me": me({ name: "Ada" }) })
    const { user } = mount()
    await user.click(await screen.findByText("Ada"))
    await user.click(screen.getByRole("button", { name: "Profile" }))
    expect(await screen.findByText("profile page")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Sign out" })).not.toBeInTheDocument()
  })

  test("Sign out ends the OIDC session", async () => {
    mockApi({ "GET /me": me({ name: "Ada" }) })
    const { user } = mount()
    await user.click(await screen.findByText("Ada"))
    await user.click(screen.getByRole("button", { name: "Sign out" }))
    expect(signedOut).toBe(1)
  })
})

describe("Layout: theme", () => {
  test("the dark theme adds the dark class to <html>", async () => {
    mockApi({ "GET /me": me({ theme: "dark" }) })
    mount()
    await waitFor(() => expect(document.documentElement.classList.contains("dark")).toBe(true))
  })

  test("the light theme removes it", async () => {
    document.documentElement.classList.add("dark")
    mockApi({ "GET /me": me({ theme: "light" }) })
    mount()
    await waitFor(() => expect(document.documentElement.classList.contains("dark")).toBe(false))
  })

  test("'system' follows the operating system preference", async () => {
    const original = window.matchMedia
    window.matchMedia = ((q: string) => ({ matches: q.includes("dark"), media: q, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false })) as typeof window.matchMedia
    try {
      mockApi({ "GET /me": me({ theme: "system" }) })
      mount()
      await waitFor(() => expect(document.documentElement.classList.contains("dark")).toBe(true))
    } finally { window.matchMedia = original }
  })
})
