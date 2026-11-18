import { describe, expect, mock, test } from "bun:test"
import { account } from "../../../test/fixtures"
import { renderApp, screen } from "../../../test/render"
import { AccountSelector } from "./AccountSelector"

const accounts = [account({ id: "a1", name: "Everyday" }), account({ id: "a2", name: null, iban: "NL02SAVE0000000002" })]

describe("AccountSelector", () => {
  test("offers 'All accounts' plus one chip per account (name, or IBAN when unnamed)", () => {
    renderApp(<AccountSelector accounts={accounts} selected={new Set()} onChange={() => {}} />)
    expect(screen.getByRole("button", { name: "All accounts" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Everyday" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "NL02SAVE0000000002" })).toBeInTheDocument()
  })

  test("with nothing selected, 'All accounts' is the pressed one", () => {
    renderApp(<AccountSelector accounts={accounts} selected={new Set()} onChange={() => {}} />)
    expect(screen.getByRole("button", { name: "All accounts" })).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByRole("button", { name: "Everyday" })).toHaveAttribute("aria-pressed", "false")
  })

  test("selected accounts are pressed and 'All accounts' is not", () => {
    renderApp(<AccountSelector accounts={accounts} selected={new Set(["a1"])} onChange={() => {}} />)
    expect(screen.getByRole("button", { name: "Everyday" })).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByRole("button", { name: "All accounts" })).toHaveAttribute("aria-pressed", "false")
  })

  test("clicking an account adds it to the selection; clicking again removes it", async () => {
    const onChange = mock()
    const { user, rerender } = renderApp(<AccountSelector accounts={accounts} selected={new Set()} onChange={onChange} />)
    await user.click(screen.getByRole("button", { name: "Everyday" }))
    expect([...onChange.mock.calls[0][0]]).toEqual(["a1"])
    rerender(<AccountSelector accounts={accounts} selected={new Set(["a1"])} onChange={onChange} />)
    await user.click(screen.getByRole("button", { name: "Everyday" }))
    expect([...onChange.mock.calls[1][0]]).toEqual([])
  })

  test("several accounts can be selected together", async () => {
    const onChange = mock()
    const { user } = renderApp(<AccountSelector accounts={accounts} selected={new Set(["a1"])} onChange={onChange} />)
    await user.click(screen.getByRole("button", { name: "NL02SAVE0000000002" }))
    expect([...onChange.mock.calls[0][0]].sort()).toEqual(["a1", "a2"])
  })

  test("'All accounts' clears the selection", async () => {
    const onChange = mock()
    const { user } = renderApp(<AccountSelector accounts={accounts} selected={new Set(["a1", "a2"])} onChange={onChange} />)
    await user.click(screen.getByRole("button", { name: "All accounts" }))
    expect(onChange.mock.calls[0][0].size).toBe(0)
  })

  test("never mutates the selection it was given", async () => {
    const selected = new Set(["a1"])
    const { user } = renderApp(<AccountSelector accounts={accounts} selected={selected} onChange={() => {}} />)
    await user.click(screen.getByRole("button", { name: "Everyday" }))
    expect([...selected]).toEqual(["a1"])
  })
})
