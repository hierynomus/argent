import { describe, expect, test, vi } from "vitest"
import { ref } from "vue"
import { renderTemplate, screen, waitFor, within } from "../../../test/render"
import { Badge, Button, Card, ConfirmButton, EmptyState, ErrorText, Field, FieldGroup, Input, LoadingText, RoleBadge, SegmentedControl, Select, Td } from "."

const components = { Badge, Button, Card, ConfirmButton, EmptyState, ErrorText, Field, FieldGroup, Input, LoadingText, RoleBadge, SegmentedControl, Select }

describe("Button", () => {
  test("is type=button by default so it never submits a form by accident", async () => {
    const onSubmit = vi.fn()
    const { user } = await renderTemplate(
      `<form @submit.prevent="onSubmit"><Button>Plain</Button><Button type="submit">Send</Button></form>`,
      { components, setup: () => ({ onSubmit }) },
    )
    expect(screen.getByRole("button", { name: "Plain" })).toHaveAttribute("type", "button")
    await user.click(screen.getByRole("button", { name: "Plain" }))
    expect(onSubmit).not.toHaveBeenCalled()
    await user.click(screen.getByRole("button", { name: "Send" }))
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  test("fires click, and not when disabled", async () => {
    const onClick = vi.fn()
    const { user } = await renderTemplate(`<div><Button @click="onClick">Go</Button><Button @click="onClick" disabled>Nope</Button></div>`, { components, setup: () => ({ onClick }) })
    await user.click(screen.getByRole("button", { name: "Go" }))
    await user.click(screen.getByRole("button", { name: "Nope" }))
    expect(onClick).toHaveBeenCalledTimes(1)
    expect(screen.getByRole("button", { name: "Nope" })).toBeDisabled()
  })

  test("variants are visually distinct and class is appended", async () => {
    await renderTemplate(`<div><Button>primary</Button><Button variant="secondary">secondary</Button><Button variant="danger-link" class="extra">danger</Button></div>`, { components })
    expect(screen.getByRole("button", { name: "primary" }).className).toContain("bg-indigo-600")
    expect(screen.getByRole("button", { name: "secondary" }).className).toContain("border")
    expect(screen.getByRole("button", { name: "danger" }).className).toContain("text-red-500")
    expect(screen.getByRole("button", { name: "danger" }).className).toContain("extra")
  })

  test("link variants are not padded like buttons", async () => {
    await renderTemplate(`<div><Button variant="link">link</Button><Button>btn</Button></div>`, { components })
    expect(screen.getByRole("button", { name: "link" }).className).not.toContain("px-3")
    expect(screen.getByRole("button", { name: "btn" }).className).toContain("px-3")
  })
})

describe("Field", () => {
  test("associates the label with the control (getByLabelText works, click focuses)", async () => {
    const { user } = await renderTemplate(`<Field label="Start date"><Input type="date" /></Field>`, { components })
    const input = screen.getByLabelText("Start date")
    expect(input.tagName).toBe("INPUT")
    await user.click(screen.getByText("Start date"))
    expect(input).toHaveFocus()
  })

  test("works with a Select", async () => {
    await renderTemplate(`<Field label="Metal"><Select><option>Gold</option></Select></Field>`, { components })
    expect(screen.getByLabelText("Metal").tagName).toBe("SELECT")
  })

  test("each field gets its own id, so two fields never share a label", async () => {
    await renderTemplate(`<div><Field label="A"><Input /></Field><Field label="B"><Input /></Field></div>`, { components })
    expect(screen.getByLabelText("A").id).not.toBe(screen.getByLabelText("B").id)
  })

  test("respects an id the control already has", async () => {
    await renderTemplate(`<Field label="Name"><Input id="custom" /></Field>`, { components })
    expect(screen.getByLabelText("Name").id).toBe("custom")
  })

  test("shows an error and links it to the control for assistive tech", async () => {
    await renderTemplate(`<Field label="Name" error="Name is required"><Input /></Field>`, { components })
    const input = screen.getByLabelText("Name")
    expect(input).toHaveAttribute("aria-invalid", "true")
    expect(screen.getByRole("alert")).toHaveTextContent("Name is required")
    expect(input.getAttribute("aria-describedby")).toBe(screen.getByRole("alert").id)
  })

  test("without an error there is no alert and the control is not marked invalid", async () => {
    await renderTemplate(`<Field label="Name"><Input /></Field>`, { components })
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
    expect(screen.getByLabelText("Name")).not.toHaveAttribute("aria-invalid")
  })

  test("an error that appears later is announced and linked", async () => {
    const error = ref("")
    await renderTemplate(`<Field label="Name" :error="error"><Input /></Field>`, { components, setup: () => ({ error }) })
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
    error.value = "Too short"
    expect(await screen.findByRole("alert")).toHaveTextContent("Too short")
    expect(screen.getByLabelText("Name")).toHaveAttribute("aria-invalid", "true")
  })

  test("FieldGroup labels a group of buttons", async () => {
    await renderTemplate(`<FieldGroup label="Role"><button>viewer</button></FieldGroup>`, { components })
    expect(screen.getByRole("group", { name: "Role" })).toBeInTheDocument()
  })
})

describe("Input / Select", () => {
  test("v-model binds both ways, class merges with the base style, other attributes pass through", async () => {
    const text = ref("start")
    const { user } = await renderTemplate(`<Input v-model="text" aria-label="x" placeholder="p" class="w-44" density="sm" />`, { components, setup: () => ({ text }) })
    const input = screen.getByLabelText("x") as HTMLInputElement
    expect(input.value).toBe("start")
    expect(input.className).toContain("w-44")
    expect(input.className).toContain("border")
    expect(input.className).toContain("py-1")
    expect(input).toHaveAttribute("placeholder", "p")
    await user.type(input, "!")
    expect(text.value).toBe("start!")
    text.value = "changed"
    await waitFor(() => expect(input.value).toBe("changed"))
  })

  test("v-model keeps the raw text of number inputs (no number cast), so decimals survive exactly", async () => {
    const amount = ref("")
    const { user } = await renderTemplate(`<Input v-model="amount" type="number" step="0.01" aria-label="amt" />`, { components, setup: () => ({ amount }) })
    await user.type(screen.getByLabelText("amt"), "1234.50")
    expect(amount.value).toBe("1234.50")
    expect(typeof amount.value).toBe("string")
  })

  test("density changes padding", async () => {
    await renderTemplate(`<div><Input aria-label="s" density="sm" /><Input aria-label="l" density="lg" /></div>`, { components })
    expect(screen.getByLabelText("s").className).toContain("px-2 py-1")
    expect(screen.getByLabelText("l").className).toContain("px-3")
  })

  test("Select selects, with v-model", async () => {
    const choice = ref("a")
    const { user } = await renderTemplate(`<Select v-model="choice" aria-label="m"><option value="a">A</option><option value="b">B</option></Select>`, { components, setup: () => ({ choice }) })
    await user.selectOptions(screen.getByLabelText("m"), "b")
    expect(choice.value).toBe("b")
    expect((screen.getByLabelText("m") as HTMLSelectElement).value).toBe("b")
  })

  test("the themed list opens, shows the options and selects one", async () => {
    const choice = ref("a")
    const { user } = await renderTemplate(`<Select v-model="choice" aria-label="m"><option value="a">Alpha</option><option value="b">Beta</option></Select>`, { components, setup: () => ({ choice }) })
    await user.click(screen.getByRole("button", { name: "Alpha" }))
    await user.click(within(screen.getByRole("listbox")).getByRole("option", { name: "Beta" }))
    expect(choice.value).toBe("b")
    expect(screen.queryByRole("listbox")).toBeNull()
    expect(await screen.findByRole("button", { name: "Beta" })).toBeTruthy()
  })
})

describe("SegmentedControl", () => {
  test("marks the active option with aria-pressed and switches on click (v-model)", async () => {
    const value = ref("a")
    const { user } = await renderTemplate(`<SegmentedControl v-model="value" :options="['a', 'b']" />`, { components, setup: () => ({ value }) })
    expect(screen.getByRole("button", { name: "a" })).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByRole("button", { name: "b" })).toHaveAttribute("aria-pressed", "false")
    await user.click(screen.getByRole("button", { name: "b" }))
    expect(value.value).toBe("b")
    expect(screen.getByRole("button", { name: "b" })).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByRole("button", { name: "a" })).toHaveAttribute("aria-pressed", "false")
  })

  test("options can have a label different from their value", async () => {
    const value = ref("linear")
    const { user } = await renderTemplate(
      `<SegmentedControl v-model="value" :options="[{ value: 'interest_only', label: 'Interest-only' }, { value: 'linear', label: 'Linear' }]" />`,
      { components, setup: () => ({ value }) },
    )
    await user.click(screen.getByRole("button", { name: "Interest-only" }))
    expect(value.value).toBe("interest_only")
  })

  test("buttons never submit an enclosing form", async () => {
    const onSubmit = vi.fn()
    const value = ref("a")
    const { user } = await renderTemplate(`<form @submit.prevent="onSubmit"><SegmentedControl v-model="value" :options="['a', 'b']" /></form>`, { components, setup: () => ({ onSubmit, value }) })
    await user.click(screen.getByRole("button", { name: "b" }))
    expect(onSubmit).not.toHaveBeenCalled()
  })
})

describe("ConfirmButton", () => {
  test("with a prompt: Label → prompt with Yes/No; Yes confirms", async () => {
    const onConfirm = vi.fn()
    const { user } = await renderTemplate(`<ConfirmButton label="Delete thing" prompt="Delete thing?" @confirm="onConfirm" />`, { components, setup: () => ({ onConfirm }) })
    await user.click(screen.getByRole("button", { name: "Delete thing" }))
    expect(screen.getByText("Delete thing?")).toBeInTheDocument()
    expect(onConfirm).not.toHaveBeenCalled()
    await user.click(screen.getByRole("button", { name: "Yes" }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  test("without a prompt the confirm button itself reads 'Sure?'", async () => {
    const onConfirm = vi.fn()
    const { user } = await renderTemplate(`<ConfirmButton label="Delete" @confirm="onConfirm" />`, { components, setup: () => ({ onConfirm }) })
    await user.click(screen.getByRole("button", { name: "Delete" }))
    await user.click(screen.getByRole("button", { name: "Sure?" }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  test("No backs out without confirming, and the action can be started again", async () => {
    const onConfirm = vi.fn()
    const { user } = await renderTemplate(`<ConfirmButton label="Delete" @confirm="onConfirm" />`, { components, setup: () => ({ onConfirm }) })
    await user.click(screen.getByRole("button", { name: "Delete" }))
    await user.click(screen.getByRole("button", { name: "No" }))
    expect(onConfirm).not.toHaveBeenCalled()
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument()
  })

  test("start is emitted when the confirmation begins; disabled blocks it", async () => {
    const onStart = vi.fn()
    const { user } = await renderTemplate(`<div><ConfirmButton label="A" @start="onStart" /><ConfirmButton label="B" disabled /></div>`, { components, setup: () => ({ onStart }) })
    await user.click(screen.getByRole("button", { name: "A" }))
    expect(onStart).toHaveBeenCalledTimes(1)
    expect(screen.getByRole("button", { name: "B" })).toBeDisabled()
  })
})

describe("badges and states", () => {
  test("RoleBadge shows the role, editor styled differently from viewer", async () => {
    await renderTemplate(`<div><RoleBadge role="editor" /><RoleBadge role="viewer" /></div>`, { components })
    expect(screen.getByText("editor").className).toContain("indigo")
    expect(screen.getByText("viewer").className).not.toContain("indigo")
  })

  test("Badge adds the caller's classes", async () => {
    await renderTemplate(`<Badge class="bg-red-100">x</Badge>`, { components })
    expect(screen.getByText("x").className).toContain("bg-red-100")
  })

  test("LoadingText defaults to 'Loading…' but can say something else", async () => {
    await renderTemplate(`<div><LoadingText /><LoadingText>Loading portfolio…</LoadingText></div>`, { components })
    expect(screen.getByText("Loading…")).toBeInTheDocument()
    expect(screen.getByText("Loading portfolio…")).toBeInTheDocument()
  })

  test("ErrorText renders an Error's message, a string, or nothing", async () => {
    const error = ref<unknown>(new Error("boom"))
    await renderTemplate(`<ErrorText :error="error" />`, { components, setup: () => ({ error }) })
    expect(screen.getByText("boom")).toBeInTheDocument()
    error.value = "plain"
    expect(await screen.findByText("plain")).toBeInTheDocument()
    error.value = null
    await waitFor(() => expect(screen.queryByText("plain")).not.toBeInTheDocument())
  })

  test("EmptyState shows title, hint and children", async () => {
    await renderTemplate(`<EmptyState title="Nothing yet" hint="Add one"><button>Go</button></EmptyState>`, { components })
    expect(screen.getByText("Nothing yet")).toBeInTheDocument()
    expect(screen.getByText("Add one")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Go" })).toBeInTheDocument()
  })
})

describe("Card", () => {
  test("is the white bordered panel, with extra classes added on top", async () => {
    await renderTemplate(`<Card class="p-4" data-testid="c">content</Card>`, { components })
    const card = screen.getByTestId("c")
    expect(card).toHaveTextContent("content")
    expect(card.className).toContain("bg-white")
    expect(card.className).toContain("rounded-lg")
    expect(card.className).toContain("p-4")
  })

  test("size xl is the larger, softer variant", async () => {
    await renderTemplate(`<Card size="xl" data-testid="c">x</Card>`, { components })
    expect(screen.getByTestId("c").className).toContain("rounded-xl")
    expect(screen.getByTestId("c").className).not.toContain("rounded-lg")
  })

  test("`as` swaps the element and listeners still reach it", async () => {
    const onSubmit = vi.fn()
    const { user } = await renderTemplate(`<Card as="form" @submit.prevent="onSubmit"><button type="submit">Go</button></Card>`, { components, setup: () => ({ onSubmit }) })
    expect(document.querySelector("form")).not.toBeNull()
    await user.click(screen.getByRole("button", { name: "Go" }))
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })
})

describe("Td", () => {
  test("padding, alignment, mono and tone are props, not hand-written classes", async () => {
    await renderTemplate(`<table><tbody><tr>
      <Td>plain</Td><Td align="right" mono tone="muted">1,00</Td><Td dense tone="strong">small</Td></tr></tbody></table>`, { components: { Td } })
    expect(screen.getByText("plain")).toHaveClass("px-4", "py-3")
    expect(screen.getByText("1,00")).toHaveClass("text-right", "font-mono", "text-gray-600")
    const dense = screen.getByText("small")
    expect(dense).toHaveClass("py-2", "text-gray-900")
    expect(dense).not.toHaveClass("py-3")
  })
})
