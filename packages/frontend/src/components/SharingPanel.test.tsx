import { describe, expect, mock, test } from "bun:test"
import { renderApp, screen, waitFor } from "../../test/render"
import { SharingPanel, type SharingMember } from "./SharingPanel"

const setup = (members: SharingMember[] = [], over: { onAdd?: (m: SharingMember) => Promise<unknown>; onRemove?: (g: string) => Promise<unknown> } = {}) => {
  const onAdd = mock(over.onAdd ?? (async () => {}))
  const onRemove = mock(over.onRemove ?? (async () => {}))
  const utils = renderApp(<SharingPanel members={members} onAdd={onAdd} onRemove={onRemove} />)
  return { onAdd, onRemove, ...utils }
}

describe("SharingPanel", () => {
  test("says so when nothing is shared", () => {
    setup()
    expect(screen.getByText("Not shared with anyone.")).toBeInTheDocument()
  })

  test("lists the groups with their roles", () => {
    setup([{ groupName: "family", role: "editor" }, { groupName: "friends", role: "viewer" }])
    expect(screen.getByText("family")).toBeInTheDocument()
    expect(screen.getByText("friends")).toBeInTheDocument()
    expect(screen.getAllByText("editor").length).toBeGreaterThan(0)
    expect(screen.queryByText("Not shared with anyone.")).not.toBeInTheDocument()
  })

  test("adding sends the trimmed group name with the chosen role, then clears the field", async () => {
    const { onAdd, user } = setup()
    const input = screen.getByLabelText("Group name")
    await user.type(input, "  family  ")
    await user.click(screen.getByRole("button", { name: "editor" }))
    await user.click(screen.getByRole("button", { name: "+ Add" }))
    await waitFor(() => expect(onAdd).toHaveBeenCalledTimes(1))
    expect(onAdd).toHaveBeenCalledWith({ groupName: "family", role: "editor" })
    await waitFor(() => expect((input as HTMLInputElement).value).toBe(""))
  })

  test("the role defaults to viewer", async () => {
    const { onAdd, user } = setup()
    expect(screen.getByRole("button", { name: "viewer" })).toHaveAttribute("aria-pressed", "true")
    await user.type(screen.getByLabelText("Group name"), "x")
    await user.click(screen.getByRole("button", { name: "+ Add" }))
    await waitFor(() => expect(onAdd).toHaveBeenCalledWith({ groupName: "x", role: "viewer" }))
  })

  test("Add is disabled until a (non-blank) group name is typed", async () => {
    const { user } = setup()
    const add = screen.getByRole("button", { name: "+ Add" })
    expect(add).toBeDisabled()
    await user.type(screen.getByLabelText("Group name"), "   ")
    expect(add).toBeDisabled()
    await user.type(screen.getByLabelText("Group name"), "a")
    expect(add).toBeEnabled()
  })

  test("a failed add shows the server's message and keeps what was typed", async () => {
    const { user } = setup([], { onAdd: async () => { throw new Error("groupName is required") } })
    const input = screen.getByLabelText("Group name") as HTMLInputElement
    await user.type(input, "oops")
    await user.click(screen.getByRole("button", { name: "+ Add" }))
    expect(await screen.findByText("groupName is required")).toBeInTheDocument()
    expect(input.value).toBe("oops")
  })

  test("removing calls onRemove with that group", async () => {
    const { onRemove, user } = setup([{ groupName: "friends", role: "viewer" }, { groupName: "family", role: "editor" }])
    const rows = screen.getAllByRole("button", { name: "Remove" })
    expect(rows).toHaveLength(2)
    await user.click(rows[1])
    await waitFor(() => expect(onRemove).toHaveBeenCalledWith("family"))
  })

  test("a failed remove is reported", async () => {
    const { user } = setup([{ groupName: "friends", role: "viewer" }], { onRemove: async () => { throw new Error("Forbidden") } })
    await user.click(screen.getByRole("button", { name: "Remove" }))
    expect(await screen.findByText("Forbidden")).toBeInTheDocument()
  })
})
