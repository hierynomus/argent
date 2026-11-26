import { describe, expect, test, vi } from "vitest"
import { account } from "../../../test/fixtures"
import { renderApp, screen } from "../../../test/render"
import AccountSelector from "./AccountSelector.vue"

const accounts = [account({ id: "a1", name: "Everyday" }), account({ id: "a2", name: null, iban: "NL02SAVE0000000002" })]

describe("AccountSelector", () => {
  test("offers 'All accounts' plus one chip per account (name, or IBAN when unnamed)", async () => {
    await renderApp(AccountSelector, { props: { accounts, selected: new Set() } })
    expect(screen.getByRole("button", { name: "All accounts" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Everyday" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "NL02SAVE0000000002" })).toBeInTheDocument()
  })

  test("with nothing selected, 'All accounts' is the pressed one", async () => {
    await renderApp(AccountSelector, { props: { accounts, selected: new Set() } })
    expect(screen.getByRole("button", { name: "All accounts" })).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByRole("button", { name: "Everyday" })).toHaveAttribute("aria-pressed", "false")
  })

  test("selected accounts are pressed and 'All accounts' is not", async () => {
    await renderApp(AccountSelector, { props: { accounts, selected: new Set(["a1"]) } })
    expect(screen.getByRole("button", { name: "Everyday" })).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByRole("button", { name: "All accounts" })).toHaveAttribute("aria-pressed", "false")
  })

  test("clicking an account adds it to the selection; clicking again removes it", async () => {
    const onChange = vi.fn()
    const { user, rerender } = await renderApp(AccountSelector, { props: { accounts, selected: new Set(), onChange: onChange } })
    await user.click(screen.getByRole("button", { name: "Everyday" }))
    expect([...onChange.mock.calls[0][0]]).toEqual(["a1"])
    await rerender({ accounts, selected: new Set(["a1"]), onChange })
    await user.click(screen.getByRole("button", { name: "Everyday" }))
    expect([...onChange.mock.calls[1][0]]).toEqual([])
  })

  test("several accounts can be selected together", async () => {
    const onChange = vi.fn()
    const { user } = await renderApp(AccountSelector, { props: { accounts, selected: new Set(["a1"]), onChange: onChange } })
    await user.click(screen.getByRole("button", { name: "NL02SAVE0000000002" }))
    expect([...onChange.mock.calls[0][0]].sort()).toEqual(["a1", "a2"])
  })

  test("'All accounts' clears the selection", async () => {
    const onChange = vi.fn()
    const { user } = await renderApp(AccountSelector, { props: { accounts, selected: new Set(["a1", "a2"]), onChange: onChange } })
    await user.click(screen.getByRole("button", { name: "All accounts" }))
    expect(onChange.mock.calls[0][0].size).toBe(0)
  })

  test("never mutates the selection it was given", async () => {
    const selected = new Set(["a1"])
    const { user } = await renderApp(AccountSelector, { props: { accounts, selected: selected } })
    await user.click(screen.getByRole("button", { name: "Everyday" }))
    expect([...selected]).toEqual(["a1"])
  })
})

describe("AccountSelector: holders", () => {
  const family = [
    account({ id: "a1", name: "Everyday", holder: "Alex" }),
    account({ id: "a2", name: "Rainy day", holder: "Alex" }),
    account({ id: "a3", name: "School", holder: "Sam" }),
    account({ id: "a4", name: "Old one", holder: "Sam", hidden: true }),
  ]

  test("accounts appear under their holder, hidden ones only when selected", async () => {
    const { rerender } = await renderApp(AccountSelector, { props: { accounts: family, selected: new Set() } })
    expect(screen.getByRole("button", { name: "All of Alex" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "All of Sam" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Old one" })).not.toBeInTheDocument()
    await rerender({ accounts: family, selected: new Set(["a4"]) })
    expect(screen.getByRole("button", { name: "Old one" })).toBeInTheDocument()
  })

  test("a holder's name selects all of their accounts, and clears them when they are all selected", async () => {
    const onChange = vi.fn()
    const { user, rerender } = await renderApp(AccountSelector, { props: { accounts: family, selected: new Set(), onChange } })
    await user.click(screen.getByRole("button", { name: "All of Alex" }))
    expect([...onChange.mock.calls[0][0]].sort()).toEqual(["a1", "a2"])
    await rerender({ accounts: family, selected: new Set(["a1", "a2"]), onChange })
    await user.click(screen.getByRole("button", { name: "All of Alex" }))
    expect([...onChange.mock.calls[1][0]]).toEqual([])
  })
})
