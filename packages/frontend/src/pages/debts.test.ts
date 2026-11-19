import { describe, expect, test } from "vitest"
import { mockApi, respond } from "../../test/fakeApi"
import { debt, part } from "../../test/fixtures"
import { renderApp, screen, waitFor, within } from "../../test/render"
import MortgagesPage from "./Mortgages.vue"
import LoansPage from "./Loans.vue"

/** Mortgages and Loans are the same screen with different wording — one suite runs against both. */
const kinds = [
  { name: "mortgage", Page: MortgagesPage, base: "/mortgages", heading: "Mortgages", newBtn: "+ New mortgage", createPlaceholder: "e.g. House Amsterdam", deleteBtn: "Delete mortgage", deleteAsk: "Delete mortgage?", empty: "No mortgages yet.", partPlaceholders: { name: "Part A", principal: "200000", rate: "3.500" } },
  { name: "loan", Page: LoansPage, base: "/loans", heading: "Loans", newBtn: "+ New loan", createPlaceholder: "e.g. Car loan", deleteBtn: "Delete loan", deleteAsk: "Delete loan?", empty: "No loans yet.", partPlaceholders: { name: "Main", principal: "10000", rate: "5.000" } },
] as const

for (const k of kinds) {
  describe(`${k.name}s page`, () => {
    const setup = async (list: unknown[], extra: Record<string, any> = {}) => {
      const api = mockApi({
        [`GET ${k.base}`]: list,
        [`POST ${k.base}`]: ({ body }: any) => ({ id: "new", ...body }),
        [`DELETE ${k.base}/:id`]: respond(204),
        [`POST ${k.base}/preview-part`]: ({ body }: any) => ({
          currentBalance: 204819.22, monthlyPayment: 1076.43, monthlyInterest: 537.65, monthlyPrincipal: 538.78, originalMonthlyPayment: 1076.43,
          totalMonths: 360, monthsElapsed: 96, monthsRemaining: 264, projectedEndDate: body.endDate, capitalizedInterest: body.firstPaymentDate ? 486.9 : 0,
        }),
        [`POST ${k.base}/:id/parts`]: ({ body }: any) => ({ id: "np", ...body }),
        [`PATCH ${k.base}/:id/parts/:pid`]: ({ body }: any) => ({ id: "part-1", ...body }),
        [`DELETE ${k.base}/:id/parts/:pid`]: respond(204),
        [`POST ${k.base}/:id/parts/:pid/rates`]: ({ body }: any) => ({ id: "nr", ...body }),
        [`DELETE ${k.base}/:id/parts/:pid/rates/:rid`]: respond(204),
        [`POST ${k.base}/:id/parts/:pid/payments`]: ({ body }: any) => ({ id: "ep", ...body }),
        [`DELETE ${k.base}/:id/parts/:pid/payments/:payId`]: respond(204),
        [`POST ${k.base}/:id/members`]: ({ body }: any) => body,
        [`DELETE ${k.base}/:id/members/:group`]: respond(204),
        ...extra,
      })
      return { api, ...(await renderApp(k.Page)) }
    }

    test("lists each item with its totals and parts", async () => {
      const api = (await setup([debt({ name: "House", totalCurrentBalance: 180000, totalMonthlyPayment: 900 })])).api
      expect(await screen.findByRole("heading", { name: k.heading })).toBeInTheDocument()
      expect(await screen.findByText("House")).toBeInTheDocument()
      expect(screen.getByText("Part A")).toBeInTheDocument()
      expect(screen.getByText("Annuity")).toBeInTheDocument()
      expect(screen.getByText("3.50%")).toBeInTheDocument()
      expect(screen.getAllByText(/180\.000/).length).toBeGreaterThan(0) // balance
      expect(api.unmatched).toEqual([])
    })

    test("shows an empty state", async () => {
      await setup([])
      expect(await screen.findByText(k.empty)).toBeInTheDocument()
    })

    test("creates a new one with the chosen currency", async () => {
      const { api, user } = await setup([])
      await screen.findByText(k.empty)
      await user.click(screen.getByRole("button", { name: k.newBtn }))
      await user.type(screen.getByPlaceholderText(k.createPlaceholder), "My thing")
      await user.click(screen.getByRole("button", { name: "USD" }))
      await user.click(screen.getByRole("button", { name: "Create" }))
      await waitFor(() => expect(api.calls("POST", k.base)).toHaveLength(1))
      expect(api.calls("POST", k.base)[0].body).toEqual({ name: "My thing", currency: "USD" })
      await waitFor(() => expect(api.calls("GET", k.base).length).toBeGreaterThan(1)) // list refreshed
    })

    test("'Create' stays disabled until a name is entered", async () => {
      const { user } = await setup([])
      await screen.findByText(k.empty)
      await user.click(screen.getByRole("button", { name: k.newBtn }))
      expect(screen.getByRole("button", { name: "Create" })).toBeDisabled()
    })

    test("adds a part: the rate is entered in % and sent as a fraction", async () => {
      const { api, user } = await setup([debt({ parts: [] })])
      await user.click(await screen.findByRole("button", { name: "+ Add part" }))
      await user.type(screen.getByPlaceholderText(k.partPlaceholders.name), "Fixed")
      await user.click(screen.getByRole("button", { name: "Linear" }))
      await user.type(screen.getByPlaceholderText(k.partPlaceholders.principal), "150000")
      await user.type(screen.getByPlaceholderText(k.partPlaceholders.rate), "3.5")
      await user.type(screen.getByLabelText("Start date"), "2024-01-01")
      await user.type(screen.getByLabelText("Term (months)"), "240")
      await user.click(screen.getByRole("button", { name: "Add part" }))
      await waitFor(() => expect(api.calls("POST", `${k.base}/d1/parts`)).toHaveLength(1))
      expect(api.calls("POST", `${k.base}/d1/parts`)[0].body).toEqual({
        name: "Fixed", type: "linear", principal: "150000", annualInterestRate: "0.035000", rateType: "nominal", startDate: "2024-01-01", endDate: "2044-01-01",
      })
    })

    test("a preview of what the part comes to appears once the form is valid, so the numbers can be checked", async () => {
      const { api, user } = await setup([debt({ parts: [] })])
      await user.click(await screen.findByRole("button", { name: "+ Add part" }))
      const preview = screen.getByRole("group", { name: "Preview of this part" })
      expect(within(preview).getByText(/Fill in the principal, rate, start date and term/)).toBeInTheDocument()
      await user.type(screen.getByPlaceholderText(k.partPlaceholders.principal), "250000")
      await user.type(screen.getByPlaceholderText(k.partPlaceholders.rate), "3.15")
      await user.type(screen.getByLabelText("Start date"), "2018-10-09")
      expect(api.calls("POST", `${k.base}/preview-part`)).toHaveLength(0) // incomplete: nothing is asked
      await user.type(screen.getByLabelText("First payment"), "2018-12-01")
      await user.type(screen.getByLabelText("Term (months)"), "360")
      expect(await within(preview).findByText(/204\.819,22/, undefined, { timeout: 3000 })).toBeInTheDocument()
      expect(within(preview).getByText(/1\.076,43/)).toBeInTheDocument()
      expect(within(preview).getByText(/264 to go/)).toBeInTheDocument()
      expect(within(preview).getByText(/486,90 interest for the partial first month/)).toBeInTheDocument()
      const sent = api.calls("POST", `${k.base}/preview-part`).at(-1)!.body
      expect(sent).toMatchObject({ type: "annuity", principal: "250000", annualInterestRate: "0.031500", startDate: "2018-10-09", firstPaymentDate: "2018-12-01", endDate: "2048-11-01" })
      expect(sent).not.toHaveProperty("name") // the name changes nothing about the numbers
    })

    test("a first payment date after a mid-month payout: the term is counted from that first payment", async () => {
      const { api, user } = await setup([debt({ parts: [] })])
      await user.click(await screen.findByRole("button", { name: "+ Add part" }))
      await user.type(screen.getByPlaceholderText(k.partPlaceholders.name), "Annuity")
      await user.type(screen.getByPlaceholderText(k.partPlaceholders.principal), "250000")
      await user.type(screen.getByPlaceholderText(k.partPlaceholders.rate), "3.15")
      await user.type(screen.getByLabelText("Start date"), "2018-10-09")
      await user.type(screen.getByLabelText("First payment"), "2018-12-01")
      await user.type(screen.getByLabelText("Term (months)"), "360")
      await user.click(screen.getByRole("button", { name: "Add part" }))
      await waitFor(() => expect(api.calls("POST", `${k.base}/d1/parts`)).toHaveLength(1))
      expect(api.calls("POST", `${k.base}/d1/parts`)[0].body).toMatchObject({ startDate: "2018-10-09", firstPaymentDate: "2018-12-01", endDate: "2048-11-01" })
    })

    test("a rate quoted as effective is sent as such", async () => {
      const { api, user } = await setup([debt({ parts: [] })])
      await user.click(await screen.findByRole("button", { name: "+ Add part" }))
      await user.type(screen.getByPlaceholderText(k.partPlaceholders.name), "Car loan")
      await user.type(screen.getByPlaceholderText(k.partPlaceholders.principal), "28500")
      await user.type(screen.getByPlaceholderText(k.partPlaceholders.rate), "5.9")
      expect(screen.getByRole("button", { name: "Nominal" })).toHaveAttribute("aria-pressed", "true") // the default
      await user.click(screen.getByRole("button", { name: "Effective" }))
      await user.type(screen.getByLabelText("Start date"), "2024-11-28")
      await user.type(screen.getByLabelText("Term (months)"), "37")
      await user.click(screen.getByRole("button", { name: "Add part" }))
      await waitFor(() => expect(api.calls("POST", `${k.base}/d1/parts`)).toHaveLength(1))
      expect(api.calls("POST", `${k.base}/d1/parts`)[0].body).toMatchObject({ annualInterestRate: "0.059000", rateType: "effective" })
    })

    test("the term is entered in months; the last payment date is worked out and shown", async () => {
      const { api, user } = await setup([debt({ parts: [] })])
      await user.click(await screen.findByRole("button", { name: "+ Add part" }))
      expect(screen.queryByText(/Last payment/)).not.toBeInTheDocument()
      await user.type(screen.getByLabelText("Start date"), "2024-11-28")
      await user.type(screen.getByLabelText("Term (months)"), "37")
      expect(screen.getByText(/Last payment/).textContent).toContain("2027")
      await user.type(screen.getByPlaceholderText(k.partPlaceholders.name), "Loan")
      await user.type(screen.getByPlaceholderText(k.partPlaceholders.principal), "28500")
      await user.type(screen.getByPlaceholderText(k.partPlaceholders.rate), "5.9")
      await user.click(screen.getByRole("button", { name: "Add part" }))
      await waitFor(() => expect(api.calls("POST", `${k.base}/d1/parts`)).toHaveLength(1))
      expect(api.calls("POST", `${k.base}/d1/parts`)[0].body).toMatchObject({ startDate: "2024-11-28", endDate: "2027-12-28" })
    })

    test("editing a part shows its term in months and sends the new end date", async () => {
      const { api, user } = await setup([debt({ parts: [part({ startDate: "2020-01-01", endDate: "2050-01-01" })] })])
      await screen.findByText("Part A")
      await user.click(screen.getByRole("button", { name: "Edit" }))
      const term = screen.getByLabelText("Term (months)") as HTMLInputElement
      expect(term.value).toBe("360")
      await user.clear(term)
      await user.type(term, "240")
      await user.click(screen.getByRole("button", { name: "Save" }))
      await waitFor(() => expect(api.calls("PATCH", `${k.base}/d1/parts/part-1`)).toHaveLength(1))
      expect(api.calls("PATCH", `${k.base}/d1/parts/part-1`)[0].body).toMatchObject({ endDate: "2040-01-01" })
    })

    test("the add-part button stays disabled until the form is complete", async () => {
      const { user } = await setup([debt({ parts: [] })])
      await user.click(await screen.findByRole("button", { name: "+ Add part" }))
      expect(screen.getByRole("button", { name: "Add part" })).toBeDisabled()
    })

    test("edits a part (rate shown in %, sent as a fraction)", async () => {
      const { api, user } = await setup([debt()])
      await screen.findByText("Part A")
      await user.click(screen.getByRole("button", { name: "Edit" }))
      const rate = screen.getByLabelText("Rate (%)") as HTMLInputElement
      expect(rate.value).toBe("3.5000")
      await user.clear(rate)
      await user.type(rate, "4")
      await user.click(screen.getByRole("button", { name: "Save" }))
      await waitFor(() => expect(api.calls("PATCH", `${k.base}/d1/parts/part-1`)).toHaveLength(1))
      expect(api.calls("PATCH", `${k.base}/d1/parts/part-1`)[0].body).toEqual({ name: "Part A", annualInterestRate: "0.040000", rateType: "nominal", endDate: "2050-01-01" })
    })

    test("the table marks effective rates, and the edit form can switch the rate type", async () => {
      const { api, user } = await setup([debt({ parts: [part({ rateType: "effective" })] })])
      await screen.findByText("Part A")
      expect(screen.getByTitle("Effective annual rate")).toBeInTheDocument()
      await user.click(screen.getByRole("button", { name: "Edit" }))
      expect(screen.getByRole("button", { name: "Effective" })).toHaveAttribute("aria-pressed", "true")
      await user.click(screen.getByRole("button", { name: "Nominal" }))
      await user.click(screen.getByRole("button", { name: "Save" }))
      await waitFor(() => expect(api.calls("PATCH", `${k.base}/d1/parts/part-1`)).toHaveLength(1))
      expect(api.calls("PATCH", `${k.base}/d1/parts/part-1`)[0].body).toMatchObject({ rateType: "nominal" })
    })

    test("a part paid down early shows its projected end, with the scheduled end as a tooltip", async () => {
      await setup([debt({ parts: [part({ endDate: "2050-01-01", projectedEndDate: "2049-06-01", monthsElapsed: 60, monthsRemaining: 100 })] })])
      await screen.findByText("Part A")
      const end = screen.getByTitle(/Scheduled end/)
      expect(end.textContent).toContain("2049")
      expect(end.getAttribute("title")).toContain("2050")
      expect(screen.getByText("100mo")).toBeInTheDocument()
    })

    test("deleting a part needs a confirmation", async () => {
      const { api, user } = await setup([debt()])
      await screen.findByText("Part A")
      await user.click(screen.getByRole("button", { name: "Delete" }))
      expect(api.calls("DELETE")).toHaveLength(0) // nothing yet
      await user.click(screen.getByRole("button", { name: "No" }))
      expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument()
      await user.click(screen.getByRole("button", { name: "Delete" }))
      await user.click(screen.getByRole("button", { name: "Sure?" }))
      await waitFor(() => expect(api.calls("DELETE", `${k.base}/d1/parts/part-1`)).toHaveLength(1))
    })

    test("the rate column announces the end of the fixed-rate period", async () => {
      await setup([debt({ parts: [part({ currentRate: { annualInterestRate: "0.0315", rateType: "nominal" }, nextRateChange: { effectiveDate: "2038-11-01", annualInterestRate: "0.0410", rateType: "nominal" } })] })])
      await screen.findByText("Part A")
      expect(screen.getByText(/→ 4\.10% from .*2038/)).toBeInTheDocument()
    })

    test("the rate column shows the current rate once a change is in effect", async () => {
      await setup([debt({ parts: [part({ annualInterestRate: "0.0315", currentRate: { annualInterestRate: "0.0410", rateType: "nominal" }, nextRateChange: null })] })])
      await screen.findByText("Part A")
      expect(screen.getByText(/4\.10%/)).toBeInTheDocument()
      expect(screen.queryByText(/→ \d.* from/)).toBeNull()
    })

    test("records and removes rate changes (the rate is entered in % and sent as a fraction)", async () => {
      const withRate = debt({ parts: [part({ annualInterestRate: "0.0315", rates: [{ id: "r1", partId: "part-1", effectiveDate: "2038-11-01", annualInterestRate: "0.050000", rateType: "nominal", createdAt: "" }] })] })
      const { api, user } = await setup([withRate])
      await screen.findByText("Part A")
      await user.click(screen.getByRole("button", { name: "Rates" }))
      expect(screen.getByText("Start (the rate of the part)")).toBeInTheDocument()
      expect(screen.getByText(/Expected: the payment below assumes this rate/)).toBeInTheDocument() // dated in the future

      await user.type(screen.getByLabelText("New rate from"), "2043-11-01")
      await user.type(screen.getByLabelText("Rate (%/yr)"), "4.1")
      await user.click(screen.getByRole("button", { name: "Effective" }))
      await user.click(screen.getByRole("button", { name: "Add" }))
      await waitFor(() => expect(api.calls("POST", `${k.base}/d1/parts/part-1/rates`)).toHaveLength(1))
      expect(api.calls("POST", `${k.base}/d1/parts/part-1/rates`)[0].body).toEqual({ effectiveDate: "2043-11-01", annualInterestRate: "0.041000", rateType: "effective" })

      await user.click(screen.getByRole("button", { name: "Remove" }))
      await waitFor(() => expect(api.calls("DELETE", `${k.base}/d1/parts/part-1/rates/r1`)).toHaveLength(1))
    })

    test("a viewer sees the rate history but cannot change it", async () => {
      await setup([debt({ canEdit: false, parts: [part({ rates: [{ id: "r1", partId: "part-1", effectiveDate: "2030-01-01", annualInterestRate: "0.050000", rateType: "nominal", createdAt: "" }] })] })])
      await screen.findByText("Part A")
      const { default: userEvent } = await import("@testing-library/user-event")
      await userEvent.setup().click(screen.getByRole("button", { name: "Rates" }))
      expect(screen.queryByLabelText("New rate from")).toBeNull()
      expect(screen.queryByRole("button", { name: "Remove" })).toBeNull()
    })

    test("records and removes extra payments", async () => {
      const withPayment = debt({ parts: [part({ extraPayments: [{ id: "ep1", partId: "part-1", paymentDate: "2023-05-01", amount: "5000.00", notes: "bonus", createdAt: "" }] })] })
      const { api, user } = await setup([withPayment])
      await screen.findByText("Part A")
      await user.click(screen.getByRole("button", { name: "Payments" }))
      expect(screen.getByText("2023-05-01")).toBeInTheDocument()
      expect(screen.getByText("bonus")).toBeInTheDocument()

      await user.type(screen.getByLabelText("Date"), "2024-02-01")
      await user.type(screen.getByLabelText(/^Amount/), "1234.5")
      await user.click(screen.getByRole("button", { name: "Add" }))
      await waitFor(() => expect(api.calls("POST", `${k.base}/d1/parts/part-1/payments`)).toHaveLength(1))
      expect(api.calls("POST", `${k.base}/d1/parts/part-1/payments`)[0].body).toEqual({ paymentDate: "2024-02-01", amount: "1234.5" })

      await user.click(screen.getByRole("button", { name: "Remove" }))
      await waitFor(() => expect(api.calls("DELETE", `${k.base}/d1/parts/part-1/payments/ep1`)).toHaveLength(1))
    })

    test("owner can share: add a group with a role, and remove one", async () => {
      const { api, user } = await setup([debt({ members: [{ groupName: "friends", role: "viewer" }] })])
      await screen.findByText("House")
      await user.click(screen.getByRole("button", { name: "Share" }))
      expect(screen.getByText("friends")).toBeInTheDocument()

      await user.type(screen.getByPlaceholderText("e.g. family"), "  family ")
      await user.click(screen.getByRole("button", { name: "editor" }))
      await user.click(screen.getByRole("button", { name: "+ Add" }))
      await waitFor(() => expect(api.calls("POST", `${k.base}/d1/members`)).toHaveLength(1))
      expect(api.calls("POST", `${k.base}/d1/members`)[0].body).toEqual({ groupName: "family", role: "editor" })

      await user.click(screen.getByRole("button", { name: "Remove" }))
      await waitFor(() => expect(api.calls("DELETE", `${k.base}/d1/members/friends`)).toHaveLength(1))
    })

    test("owner can delete the whole thing after confirming", async () => {
      const { api, user } = await setup([debt()])
      await user.click(await screen.findByRole("button", { name: k.deleteBtn }))
      expect(screen.getByText(k.deleteAsk)).toBeInTheDocument()
      await user.click(screen.getByRole("button", { name: "Yes" }))
      await waitFor(() => expect(api.calls("DELETE", `${k.base}/d1`)).toHaveLength(1))
    })

    test("an editor (not owner) can add parts but cannot share or delete, and sees their role", async () => {
      await setup([debt({ isOwner: false, canEdit: true })])
      await screen.findByText("House")
      expect(screen.getByText("editor")).toBeInTheDocument()
      expect(screen.getByRole("button", { name: "+ Add part" })).toBeInTheDocument()
      expect(screen.queryByRole("button", { name: "Share" })).not.toBeInTheDocument()
      expect(screen.queryByRole("button", { name: k.deleteBtn })).not.toBeInTheDocument()
    })

    test("a viewer has no edit controls at all", async () => {
      await setup([debt({ isOwner: false, canEdit: false })])
      await screen.findByText("House")
      expect(screen.getByText("viewer")).toBeInTheDocument()
      for (const name of ["+ Add part", "Edit", "Delete", "Share", k.deleteBtn]) {
        expect(screen.queryByRole("button", { name })).not.toBeInTheDocument()
      }
      // read-only things are still available
      expect(screen.getByRole("button", { name: "Payments" })).toBeInTheDocument()
    })

    test("API errors while adding are shown to the user", async () => {
      const { user } = await setup([debt({ parts: [] })], { [`POST ${k.base}/:id/parts`]: respond(400, { error: "Something the server dislikes" }) })
      await user.click(await screen.findByRole("button", { name: "+ Add part" }))
      await user.type(screen.getByPlaceholderText(k.partPlaceholders.name), "X")
      await user.type(screen.getByPlaceholderText(k.partPlaceholders.principal), "1")
      await user.type(screen.getByPlaceholderText(k.partPlaceholders.rate), "1")
      await user.type(screen.getByLabelText("Start date"), "2024-01-01")
      await user.type(screen.getByLabelText("Term (months)"), "12")
      await user.click(screen.getByRole("button", { name: "Add part" }))
      expect(await screen.findByText("Something the server dislikes")).toBeInTheDocument()
    })
  })
}
