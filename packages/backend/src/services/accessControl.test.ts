import { beforeAll, describe, expect, test } from "bun:test"
import { db } from "../db"
import { accounts, accountMembers, portfolios, portfolioMembers, mortgages, mortgageMembers, loans, loanMembers } from "../db/schema"
import {
  getViewableAccountIds, getEditableAccountIds,
  getViewablePortfolioIds, getEditablePortfolioIds,
  getViewableMortgageIds, getEditableMortgageIds,
  getViewableLoanIds, getEditableLoanIds,
  canViewAccount, canEditAccount, canViewPortfolio, canEditPortfolio,
  canViewMortgage, canEditMortgage, canViewLoan, canEditLoan,
  toAccessContext,
  type AccessContext,
} from "./accessControl"

// Actors
const owner: AccessContext = { sub: "owner", groups: [], isAdmin: false }
const viewer: AccessContext = { sub: "viewer", groups: ["g-view"], isAdmin: false }
const editor: AccessContext = { sub: "editor", groups: ["g-edit"], isAdmin: false }
const stranger: AccessContext = { sub: "stranger", groups: ["g-other"], isAdmin: false }
const ungrouped: AccessContext = { sub: "nogroups", groups: [], isAdmin: false }
const admin: AccessContext = { sub: "admin", groups: [], isAdmin: true }
const multiGroup: AccessContext = { sub: "multi", groups: ["g-view", "g-edit", "g-other"], isAdmin: false }

/** One adapter per resource kind so the same matrix runs against all of them. */
interface Kind {
  name: string
  /** creates a resource; returns its id */
  create(ownerSub: string | null, tag: string): Promise<string>
  share(id: string, groupName: string, role: "viewer" | "editor"): Promise<void>
  viewable(ctx: AccessContext): Promise<string[]>
  editable(ctx: AccessContext): Promise<string[]>
  canView(ctx: AccessContext, id: string): Promise<boolean>
  canEdit(ctx: AccessContext, id: string): Promise<boolean>
}

let n = 0
const uniq = () => `${Date.now()}-${n++}`

const kinds: Kind[] = [
  {
    name: "accounts",
    create: async (ownerSub) =>
      (await db.insert(accounts).values({ iban: `NL${uniq()}`, currency: "EUR", ownerSub }).returning())[0].id,
    share: async (accountId, groupName, role) => void (await db.insert(accountMembers).values({ accountId, groupName, role })),
    viewable: getViewableAccountIds,
    editable: getEditableAccountIds,
    canView: canViewAccount,
    canEdit: canEditAccount,
  },
  {
    name: "portfolios(crypto)",
    create: async (ownerSub) =>
      (await db.insert(portfolios).values({ type: "crypto", name: "p", ownerSub }).returning())[0].id,
    share: async (portfolioId, groupName, role) => void (await db.insert(portfolioMembers).values({ portfolioId, groupName, role })),
    viewable: (c) => getViewablePortfolioIds(c, "crypto"),
    editable: (c) => getEditablePortfolioIds(c, "crypto"),
    canView: (c, id) => canViewPortfolio(c, "crypto", id),
    canEdit: (c, id) => canEditPortfolio(c, "crypto", id),
  },
  {
    name: "mortgages",
    create: async (ownerSub) =>
      (await db.insert(mortgages).values({ name: "m", ownerSub }).returning())[0].id,
    share: async (mortgageId, groupName, role) => void (await db.insert(mortgageMembers).values({ mortgageId, groupName, role })),
    viewable: getViewableMortgageIds,
    editable: getEditableMortgageIds,
    canView: canViewMortgage,
    canEdit: canEditMortgage,
  },
  {
    name: "loans",
    create: async (ownerSub) =>
      (await db.insert(loans).values({ name: "l", ownerSub }).returning())[0].id,
    share: async (loanId, groupName, role) => void (await db.insert(loanMembers).values({ loanId, groupName, role })),
    viewable: getViewableLoanIds,
    editable: getEditableLoanIds,
    canView: canViewLoan,
    canEdit: canEditLoan,
  },
]

for (const kind of kinds) {
  describe(`access control: ${kind.name}`, () => {
    let shared: string      // owned by `owner`, shared with g-view (viewer) + g-edit (editor)
    let unshared: string    // owned by `owner`, no members
    let orphan: string      // no owner, no members

    beforeAll(async () => {
      shared = await kind.create("owner", "shared")
      await kind.share(shared, "g-view", "viewer")
      await kind.share(shared, "g-edit", "editor")
      unshared = await kind.create("owner", "unshared")
      orphan = await kind.create(null, "orphan")
    })

    test("owner can view and edit everything they own, nothing else", async () => {
      const v = await kind.viewable(owner)
      const e = await kind.editable(owner)
      expect(v).toContain(shared); expect(v).toContain(unshared); expect(v).not.toContain(orphan)
      expect(e).toContain(shared); expect(e).toContain(unshared); expect(e).not.toContain(orphan)
    })

    test("viewer-role group can view but not edit", async () => {
      expect(await kind.viewable(viewer)).toContain(shared)
      expect(await kind.viewable(viewer)).not.toContain(unshared)
      expect(await kind.editable(viewer)).not.toContain(shared)
    })

    test("editor-role group can view and edit", async () => {
      expect(await kind.viewable(editor)).toContain(shared)
      expect(await kind.editable(editor)).toContain(shared)
      expect(await kind.editable(editor)).not.toContain(unshared)
    })

    test("stranger sees nothing", async () => {
      expect(await kind.viewable(stranger)).not.toContain(shared)
      expect(await kind.editable(stranger)).not.toContain(shared)
    })

    test("user with no groups only gets what they own", async () => {
      expect(await kind.viewable(ungrouped)).toEqual([])
      expect(await kind.editable(ungrouped)).toEqual([])
    })

    test("admin sees and edits everything, including orphans", async () => {
      const v = await kind.viewable(admin)
      const e = await kind.editable(admin)
      for (const id of [shared, unshared, orphan]) {
        expect(v).toContain(id)
        expect(e).toContain(id)
      }
    })

    test("canView/canEdit agree with the ID lists for every actor and resource", async () => {
      for (const actor of [owner, viewer, editor, stranger, ungrouped, admin, multiGroup]) {
        const [v, e] = [await kind.viewable(actor), await kind.editable(actor)]
        for (const id of [shared, unshared, orphan]) {
          expect(await kind.canView(actor, id)).toBe(v.includes(id))
          expect(await kind.canEdit(actor, id)).toBe(e.includes(id))
        }
      }
    })

    test("canView/canEdit are false for unknown ids", async () => {
      const missing = "00000000-0000-0000-0000-000000000000"
      expect(await kind.canView(admin, missing)).toBe(false)
      expect(await kind.canEdit(owner, missing)).toBe(false)
    })

    test("membership via several groups yields no duplicates", async () => {
      const v = await kind.viewable(multiGroup)
      expect(v.filter((id) => id === shared)).toHaveLength(1)
      expect(await kind.editable(multiGroup)).toContain(shared)
    })

    test("owner who is also an editor member is not duplicated", async () => {
      const id = await kind.create("dual", "dual")
      await kind.share(id, "g-edit", "editor")
      const ctx: AccessContext = { sub: "dual", groups: ["g-edit"], isAdmin: false }
      expect((await kind.editable(ctx)).filter((x) => x === id)).toHaveLength(1)
    })
  })
}

describe("access control: portfolio types are isolated", () => {
  test("a stocks portfolio is not visible through the crypto lookup", async () => {
    const [p] = await db.insert(portfolios).values({ type: "stocks", name: "s", ownerSub: "typed-owner" }).returning()
    await db.insert(portfolioMembers).values({ portfolioId: p.id, groupName: "g-typed", role: "editor" })
    const member: AccessContext = { sub: "m", groups: ["g-typed"], isAdmin: false }
    const own: AccessContext = { sub: "typed-owner", groups: [], isAdmin: false }

    for (const ctx of [member, own, admin]) {
      expect(await getViewablePortfolioIds(ctx, "crypto")).not.toContain(p.id)
      expect(await getEditablePortfolioIds(ctx, "crypto")).not.toContain(p.id)
      expect(await getViewablePortfolioIds(ctx, "stocks")).toContain(p.id)
      expect(await getEditablePortfolioIds(ctx, "stocks")).toContain(p.id)
    }
  })
})

describe("canView/canEditPortfolio respect the portfolio type", () => {
  test("wrong type is denied even for the owner and admin", async () => {
    const [p] = await db.insert(portfolios).values({ type: "metals", name: "m", ownerSub: "type-owner" }).returning()
    const own: AccessContext = { sub: "type-owner", groups: [], isAdmin: false }
    expect(await canViewPortfolio(own, "metals", p.id)).toBe(true)
    expect(await canViewPortfolio(own, "crypto", p.id)).toBe(false)
    expect(await canEditPortfolio(admin, "stocks", p.id)).toBe(false)
  })
})

describe("toAccessContext", () => {
  test("defaults missing groups to []", () => {
    expect(toAccessContext({ sub: "s", isAdmin: false })).toEqual({ sub: "s", groups: [], isAdmin: false })
  })
  test("copies identity fields", () => {
    expect(toAccessContext({ sub: "s", groups: ["a"], isAdmin: true, email: "x@y" } as any)).toEqual({ sub: "s", groups: ["a"], isAdmin: true })
  })
})
