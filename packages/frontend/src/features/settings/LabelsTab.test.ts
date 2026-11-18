import { describe, expect, test } from "vitest"
import { mockApi, respond } from "../../../test/fakeApi"
import { category } from "../../../test/fixtures"
import { renderApp, screen, waitFor } from "../../../test/render"
import LabelsTab from "./LabelsTab.vue"

const setup = async (labels = [category({ id: "c1", name: "Groceries", color: "#00aa00" }), category({ id: "c2", name: "Fun", color: null })], extra: Record<string, any> = {}) => {
  const api = mockApi({
    "GET /categories": labels, "POST /categories": ({ body }: any) => ({ id: "new", ...body }), "DELETE /categories/:id": respond(204), ...extra,
  })
  return { api, ...await renderApp(LabelsTab) }
}

describe("LabelsTab", () => {
  test("lists the labels with a colour dot (grey when a label has no colour)", async () => {
    await setup()
    expect(await screen.findByText("Groceries")).toBeInTheDocument()
    expect(screen.getByText("Fun")).toBeInTheDocument()
    // (browsers report colours as rgb(), happy-dom as written — normalise to hex)
    const hex = (c: string) => {
      const m = c.match(/^rgb\((\d+), (\d+), (\d+)\)$/)
      return m ? "#" + [m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, "0")).join("") : c
    }
    const dots = Array.from(document.querySelectorAll("span.rounded-full")) as HTMLElement[]
    expect(dots.map((d) => hex(d.style.backgroundColor))).toEqual(["#00aa00", "#9ca3af"])
  })

  test("says so when there are none", async () => {
    await setup([])
    expect(await screen.findByText("No labels yet.")).toBeInTheDocument()
  })

  test("adds a label with the chosen colour; the name is trimmed and the field is cleared", async () => {
    const { api, user } = await setup()
    await screen.findByText("Groceries")
    const name = screen.getByLabelText("Label name")
    await user.type(name, "  Travel ")
    await user.click(screen.getByRole("button", { name: "Add" }))
    await waitFor(() => expect(api.calls("POST", "/categories")).toHaveLength(1))
    expect(api.calls("POST", "/categories")[0].body).toEqual({ name: "Travel", color: "#6366f1" }) // default colour
    await waitFor(() => expect((name as HTMLInputElement).value).toBe(""))
  })

  test("Add is disabled until there is a name", async () => {
    const { user } = await setup()
    await screen.findByText("Groceries")
    expect(screen.getByRole("button", { name: "Add" })).toBeDisabled()
    await user.type(screen.getByLabelText("Label name"), "   ")
    expect(screen.getByRole("button", { name: "Add" })).toBeDisabled()
  })

  test("deleting removes that label", async () => {
    const { api, user } = await setup()
    await user.click(await screen.findByRole("button", { name: "Delete label Fun" }))
    await waitFor(() => expect(api.calls("DELETE", "/categories/c2")).toHaveLength(1))
  })

  test("a server error on add is shown", async () => {
    const { user } = await setup(undefined, { "POST /categories": respond(400, { error: "name is required" }) })
    await screen.findByText("Groceries")
    await user.type(screen.getByLabelText("Label name"), "x")
    await user.click(screen.getByRole("button", { name: "Add" }))
    expect(await screen.findByText("name is required")).toBeInTheDocument()
  })
})
