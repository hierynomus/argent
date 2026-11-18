import { describe, expect, test, vi } from "vitest"
import { renderApp, screen, waitFor } from "../../test/render"
import SharingPanel, { type SharingMember } from "./SharingPanel.vue"

const setup = async (members: SharingMember[] = [], over: { addMember?: (m: SharingMember) => Promise<unknown>; removeMember?: (g: string) => Promise<unknown> } = {}) => {
  const addMember = vi.fn(over.addMember ?? (async () => {}))
  const removeMember = vi.fn(over.removeMember ?? (async () => {}))
  const utils = await renderApp(SharingPanel, { props: { members, addMember, removeMember } })
  return { addMember, removeMember, ...utils }
}

describe("SharingPanel", () => {
  test("says so when nothing is shared", async () => {
    await setup()
    expect(screen.getByText("Not shared with anyone.")).toBeInTheDocument()
  })

  test("lists the groups with their roles", async () => {
    await setup([{ groupName: "family", role: "editor" }, { groupName: "friends", role: "viewer" }])
    expect(screen.getByText("family")).toBeInTheDocument()
    expect(screen.getByText("friends")).toBeInTheDocument()
    expect(screen.getAllByText("editor").length).toBeGreaterThan(0)
    expect(screen.queryByText("Not shared with anyone.")).not.toBeInTheDocument()
  })

  test("adding sends the trimmed group name with the chosen role, then clears the field", async () => {
    const { addMember, user } = await setup()
    const input = screen.getByLabelText("Group name")
    await user.type(input, "  family  ")
    await user.click(screen.getByRole("button", { name: "editor" }))
    await user.click(screen.getByRole("button", { name: "+ Add" }))
    await waitFor(() => expect(addMember).toHaveBeenCalledTimes(1))
    expect(addMember).toHaveBeenCalledWith({ groupName: "family", role: "editor" })
    await waitFor(() => expect((input as HTMLInputElement).value).toBe(""))
  })

  test("the role defaults to viewer", async () => {
    const { addMember, user } = await setup()
    expect(screen.getByRole("button", { name: "viewer" })).toHaveAttribute("aria-pressed", "true")
    await user.type(screen.getByLabelText("Group name"), "x")
    await user.click(screen.getByRole("button", { name: "+ Add" }))
    await waitFor(() => expect(addMember).toHaveBeenCalledWith({ groupName: "x", role: "viewer" }))
  })

  test("Add is disabled until a (non-blank) group name is typed", async () => {
    const { user } = await setup()
    const add = screen.getByRole("button", { name: "+ Add" })
    expect(add).toBeDisabled()
    await user.type(screen.getByLabelText("Group name"), "   ")
    expect(add).toBeDisabled()
    await user.type(screen.getByLabelText("Group name"), "a")
    expect(add).toBeEnabled()
  })

  test("a failed add shows the server's message and keeps what was typed", async () => {
    const { user } = await setup([], { addMember: async () => { throw new Error("groupName is required") } })
    const input = screen.getByLabelText("Group name") as HTMLInputElement
    await user.type(input, "oops")
    await user.click(screen.getByRole("button", { name: "+ Add" }))
    expect(await screen.findByText("groupName is required")).toBeInTheDocument()
    expect(input.value).toBe("oops")
  })

  test("removing calls removeMember with only that group (no extra mutation arguments)", async () => {
    const { removeMember, user } = await setup([{ groupName: "friends", role: "viewer" }, { groupName: "family", role: "editor" }])
    const rows = screen.getAllByRole("button", { name: "Remove" })
    expect(rows).toHaveLength(2)
    await user.click(rows[1])
    await waitFor(() => expect(removeMember).toHaveBeenCalledWith("family"))
  })

  test("a failed remove is reported", async () => {
    const { user } = await setup([{ groupName: "friends", role: "viewer" }], { removeMember: async () => { throw new Error("Forbidden") } })
    await user.click(screen.getByRole("button", { name: "Remove" }))
    expect(await screen.findByText("Forbidden")).toBeInTheDocument()
  })

  test("the member list follows its prop", async () => {
    const { rerender } = await setup([{ groupName: "a", role: "viewer" }])
    expect(screen.getByText("a")).toBeInTheDocument()
    await rerender({ members: [{ groupName: "b", role: "editor" }] })
    expect(screen.queryByText("a")).not.toBeInTheDocument()
    expect(screen.getByText("b")).toBeInTheDocument()
  })
})
