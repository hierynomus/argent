import { describe, expect, vi, test } from "vitest"
import type { AccountWithMembers } from "@argent/shared"
import { mockApi, respond } from "../../../test/fakeApi"
import { account } from "../../../test/fixtures"
import { renderApp, screen, waitFor } from "../../../test/render"
import AccountMemberCard from "./AccountMemberCard.vue"

const acc = (over: Partial<AccountWithMembers> = {}): AccountWithMembers =>
  ({ ...account({ id: "a1", name: "Everyday", iban: "NL01CHEK0000000001" }), members: [], ownerProfile: null, ...over }) as AccountWithMembers

const setup = async (a: AccountWithMembers, extra: Record<string, any> = {}) => {
  const api = mockApi({
    "POST /admin/accounts/:id/members": ({ body }: any) => ({ accountId: "a1", ...body }),
    "DELETE /admin/accounts/:id/members/:group": respond(204),
    "PATCH /admin/accounts/:id": ({ body }: any) => ({ ...a, ...body }),
    ...extra,
  })
  const onChanged = vi.fn()
  return { api, onChanged, ...await renderApp(AccountMemberCard, { props: { account: a, onChanged: onChanged } }) }
}

describe("AccountMemberCard: header", () => {
  test("shows the account name and IBAN; an unnamed one says so", async () => {
    await setup(acc())
    expect(screen.getByText("Everyday")).toBeInTheDocument()
    expect(screen.getByText("NL01CHEK0000000001")).toBeInTheDocument()
  })
  test("unnamed accounts are labelled", async () => {
    await setup(acc({ name: null }))
    expect(screen.getByText("Unnamed")).toBeInTheDocument()
  })
})

describe("AccountMemberCard: owner", () => {
  test("prefers the owner's email, falls back to the raw sub, then to 'No owner'", async () => {
    const { unmount } = await setup(acc({ ownerSub: "sub-1", ownerProfile: { email: "o@x.nl", name: "Owner" } as any }))
    expect(screen.getByText("o@x.nl")).toBeInTheDocument()
    unmount()
    const second = await setup(acc({ ownerSub: "sub-2", ownerProfile: null }))
    expect(screen.getByText("sub-2")).toBeInTheDocument()
    second.unmount()
    await setup(acc({ ownerSub: null }))
    expect(screen.getByText("No owner")).toBeInTheDocument()
  })

  test("reassigns the owner by sub (trimmed) and tells the parent", async () => {
    const { api, onChanged, user } = await setup(acc({ ownerSub: "old" }))
    await user.click(screen.getByRole("button", { name: "Edit" }))
    const input = screen.getByLabelText("Owner (user sub)")
    expect(input).toHaveValue("old")
    await user.clear(input)
    await user.type(input, "  new-sub ")
    await user.click(screen.getByRole("button", { name: "Save" }))
    await waitFor(() => expect(api.calls("PATCH", "/admin/accounts/a1")).toHaveLength(1))
    expect(api.calls("PATCH", "/admin/accounts/a1")[0].body).toEqual({ ownerSub: "new-sub" })
    await waitFor(() => expect(onChanged).toHaveBeenCalled())
    expect(screen.queryByLabelText("Owner (user sub)")).not.toBeInTheDocument() // edit mode closed
  })

  test("a blank owner clears it (sent as null); Enter also saves", async () => {
    const { api, user } = await setup(acc({ ownerSub: "old" }))
    await user.click(screen.getByRole("button", { name: "Edit" }))
    await user.clear(screen.getByLabelText("Owner (user sub)"))
    await user.type(screen.getByLabelText("Owner (user sub)"), "{Enter}")
    await waitFor(() => expect(api.calls("PATCH")).toHaveLength(1))
    expect(api.calls("PATCH")[0].body).toEqual({ ownerSub: null })
  })

  test("Cancel restores the original value and sends nothing", async () => {
    const { api, user } = await setup(acc({ ownerSub: "old" }))
    await user.click(screen.getByRole("button", { name: "Edit" }))
    await user.type(screen.getByLabelText("Owner (user sub)"), "changed")
    await user.click(screen.getByRole("button", { name: "Cancel" }))
    expect(api.calls("PATCH")).toHaveLength(0)
    await user.click(screen.getByRole("button", { name: "Edit" }))
    expect(screen.getByLabelText("Owner (user sub)")).toHaveValue("old")
  })

  test("a failed save shows the server's message and stays in edit mode", async () => {
    const { user } = await setup(acc(), { "PATCH /admin/accounts/:id": respond(404, { error: "Not found" }) })
    await user.click(screen.getByRole("button", { name: "Edit" }))
    await user.type(screen.getByLabelText("Owner (user sub)"), "x")
    await user.click(screen.getByRole("button", { name: "Save" }))
    expect(await screen.findByText("Not found")).toBeInTheDocument()
    expect(screen.getByLabelText("Owner (user sub)")).toBeInTheDocument()
  })
})

describe("AccountMemberCard: group access", () => {
  test("lists groups with roles, or says none are assigned", async () => {
    const { unmount } = await setup(acc())
    expect(screen.getByText("No groups assigned")).toBeInTheDocument()
    unmount()
    await setup(acc({ members: [{ groupName: "family", role: "editor" }, { groupName: "friends", role: "viewer" }] }))
    expect(screen.getByText("family")).toBeInTheDocument()
    expect(screen.getByText("editor")).toBeInTheDocument()
    expect(screen.getByText("friends")).toBeInTheDocument()
    expect(screen.queryByText("No groups assigned")).not.toBeInTheDocument()
  })

  test("adds a group with a role (name trimmed) and tells the parent", async () => {
    const { api, onChanged, user } = await setup(acc())
    await user.click(screen.getByRole("button", { name: "+ Add group" }))
    await user.type(screen.getByLabelText("Group name"), "  finance-family ")
    await user.selectOptions(screen.getByLabelText("Role"), "editor")
    await user.click(screen.getByRole("button", { name: "Add" }))
    await waitFor(() => expect(api.calls("POST", "/admin/accounts/a1/members")).toHaveLength(1))
    expect(api.calls("POST", "/admin/accounts/a1/members")[0].body).toEqual({ groupName: "finance-family", role: "editor" })
    await waitFor(() => expect(onChanged).toHaveBeenCalled())
    expect(screen.getByRole("button", { name: "+ Add group" })).toBeInTheDocument() // form closed again
  })

  test("Add is disabled for a blank name, and Enter submits a valid one", async () => {
    const { api, user } = await setup(acc())
    await user.click(screen.getByRole("button", { name: "+ Add group" }))
    expect(screen.getByRole("button", { name: "Add" })).toBeDisabled()
    await user.type(screen.getByLabelText("Group name"), "   {Enter}")
    expect(api.calls("POST")).toHaveLength(0)
    await user.type(screen.getByLabelText("Group name"), "g{Enter}")
    await waitFor(() => expect(api.calls("POST")).toHaveLength(1))
  })

  test("Cancel closes the form and forgets the typed name", async () => {
    const { user } = await setup(acc())
    await user.click(screen.getByRole("button", { name: "+ Add group" }))
    await user.type(screen.getByLabelText("Group name"), "half-typed")
    await user.click(screen.getByRole("button", { name: "Cancel" }))
    await user.click(screen.getByRole("button", { name: "+ Add group" }))
    expect(screen.getByLabelText("Group name")).toHaveValue("")
  })

  test("a failed add shows the reason and keeps the form open", async () => {
    const { user } = await setup(acc(), { "POST /admin/accounts/:id/members": respond(404, { error: "Account not found" }) })
    await user.click(screen.getByRole("button", { name: "+ Add group" }))
    await user.type(screen.getByLabelText("Group name"), "g")
    await user.click(screen.getByRole("button", { name: "Add" }))
    expect(await screen.findByText("Account not found")).toBeInTheDocument()
    expect(screen.getByLabelText("Group name")).toHaveValue("g")
  })

  test("removing a group calls the API for that group and tells the parent", async () => {
    const { api, onChanged, user } = await setup(acc({ members: [{ groupName: "a b/c", role: "viewer" }] }))
    await user.click(screen.getByRole("button", { name: "Remove" }))
    await waitFor(() => expect(api.calls("DELETE", "/admin/accounts/a1/members/a%20b%2Fc")).toHaveLength(1))
    await waitFor(() => expect(onChanged).toHaveBeenCalled())
  })

  test("a failed removal is reported instead of silently ignored", async () => {
    const { user } = await setup(acc({ members: [{ groupName: "g", role: "viewer" }] }), { "DELETE /admin/accounts/:id/members/:group": respond(500, { error: "Internal server error" }) })
    await user.click(screen.getByRole("button", { name: "Remove" }))
    expect(await screen.findByText("Internal server error")).toBeInTheDocument()
  })
})
