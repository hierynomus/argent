import { describe, expect, mock, test } from "bun:test"
import { useState } from "react"
import { renderApp, screen } from "../../../test/render"
import { Badge, Button, ConfirmButton, EmptyState, ErrorText, Field, FieldGroup, Input, LoadingText, RoleBadge, SegmentedControl, Select, cx } from "."

describe("cx", () => {
  test("joins truthy class names and skips falsy ones", () => {
    expect(cx("a", false, null, undefined, "b", "")).toBe("a b")
    expect(cx()).toBe("")
    expect(cx("a", 1 > 2 && "b")).toBe("a")
  })
})

describe("Button", () => {
  test("is type=button by default so it never submits a form by accident", async () => {
    const onSubmit = mock((e: { preventDefault: () => void }) => e.preventDefault())
    const { user } = renderApp(
      <form onSubmit={onSubmit}>
        <Button>Plain</Button>
        <Button type="submit">Send</Button>
      </form>,
    )
    expect(screen.getByRole("button", { name: "Plain" })).toHaveAttribute("type", "button")
    await user.click(screen.getByRole("button", { name: "Plain" }))
    expect(onSubmit).not.toHaveBeenCalled()
    await user.click(screen.getByRole("button", { name: "Send" }))
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  test("fires onClick, and not when disabled", async () => {
    const onClick = mock()
    const { user } = renderApp(
      <>
        <Button onClick={onClick}>Go</Button>
        <Button onClick={onClick} disabled>
          Nope
        </Button>
      </>,
    )
    await user.click(screen.getByRole("button", { name: "Go" }))
    await user.click(screen.getByRole("button", { name: "Nope" }))
    expect(onClick).toHaveBeenCalledTimes(1)
    expect(screen.getByRole("button", { name: "Nope" })).toBeDisabled()
  })

  test("variants are visually distinct and className is appended", () => {
    renderApp(
      <>
        <Button>primary</Button>
        <Button variant="secondary">secondary</Button>
        <Button variant="danger-link" className="extra">danger</Button>
      </>,
    )
    expect(screen.getByRole("button", { name: "primary" }).className).toContain("bg-indigo-600")
    expect(screen.getByRole("button", { name: "secondary" }).className).toContain("border")
    expect(screen.getByRole("button", { name: "danger" }).className).toContain("text-red-500")
    expect(screen.getByRole("button", { name: "danger" }).className).toContain("extra")
  })

  test("link variants are not padded like buttons", () => {
    renderApp(<><Button variant="link">link</Button><Button>btn</Button></>)
    expect(screen.getByRole("button", { name: "link" }).className).not.toContain("px-3")
    expect(screen.getByRole("button", { name: "btn" }).className).toContain("px-3")
  })
})

describe("Field", () => {
  test("associates the label with the control (getByLabelText works, click focuses)", async () => {
    const { user } = renderApp(<Field label="Start date"><Input type="date" /></Field>)
    const input = screen.getByLabelText("Start date")
    expect(input.tagName).toBe("INPUT")
    await user.click(screen.getByText("Start date"))
    expect(input).toHaveFocus()
  })

  test("works with a Select", () => {
    renderApp(<Field label="Metal"><Select><option>Gold</option></Select></Field>)
    expect(screen.getByLabelText("Metal").tagName).toBe("SELECT")
  })

  test("each field gets its own id, so two fields never share a label", () => {
    renderApp(<><Field label="A"><Input /></Field><Field label="B"><Input /></Field></>)
    expect(screen.getByLabelText("A").id).not.toBe(screen.getByLabelText("B").id)
  })

  test("respects an id the control already has", () => {
    renderApp(<Field label="Name"><Input id="custom" /></Field>)
    expect(screen.getByLabelText("Name").id).toBe("custom")
  })

  test("shows an error and links it to the control for assistive tech", () => {
    renderApp(<Field label="Name" error="Name is required"><Input /></Field>)
    const input = screen.getByLabelText("Name")
    expect(input).toHaveAttribute("aria-invalid", "true")
    expect(screen.getByRole("alert")).toHaveTextContent("Name is required")
    expect(input.getAttribute("aria-describedby")).toBe(screen.getByRole("alert").id)
  })

  test("without an error there is no alert and the control is not marked invalid", () => {
    renderApp(<Field label="Name"><Input /></Field>)
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
    expect(screen.getByLabelText("Name")).not.toHaveAttribute("aria-invalid")
  })

  test("FieldGroup labels a group of buttons", () => {
    renderApp(<FieldGroup label="Role"><button>viewer</button></FieldGroup>)
    expect(screen.getByRole("group", { name: "Role" })).toBeInTheDocument()
  })
})

describe("Input / Select", () => {
  test("pass props through and merge className with the base style", async () => {
    const { user } = renderApp(<Input aria-label="x" placeholder="p" className="w-44" density="sm" />)
    const input = screen.getByLabelText("x")
    expect(input.className).toContain("w-44")
    expect(input.className).toContain("border")
    expect(input.className).toContain("py-1")
    await user.type(input, "hello")
    expect((input as HTMLInputElement).value).toBe("hello")
  })

  test("density changes padding", () => {
    renderApp(<><Input aria-label="s" density="sm" /><Input aria-label="l" density="lg" /></>)
    expect(screen.getByLabelText("s").className).toContain("px-2 py-1")
    expect(screen.getByLabelText("l").className).toContain("px-3")
  })

  test("Select selects", async () => {
    const onChange = mock()
    const { user } = renderApp(<Select aria-label="m" onChange={onChange}><option value="a">A</option><option value="b">B</option></Select>)
    await user.selectOptions(screen.getByLabelText("m"), "b")
    expect(onChange).toHaveBeenCalled()
    expect((screen.getByLabelText("m") as HTMLSelectElement).value).toBe("b")
  })
})

describe("SegmentedControl", () => {
  function Harness({ options }: { options: ReadonlyArray<string | { value: string; label: string }> }) {
    const [v, setV] = useState("a")
    return <SegmentedControl options={options as never} value={v} onChange={setV} />
  }

  test("marks the active option with aria-pressed and switches on click", async () => {
    const { user } = renderApp(<Harness options={["a", "b"]} />)
    expect(screen.getByRole("button", { name: "a" })).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByRole("button", { name: "b" })).toHaveAttribute("aria-pressed", "false")
    await user.click(screen.getByRole("button", { name: "b" }))
    expect(screen.getByRole("button", { name: "b" })).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByRole("button", { name: "a" })).toHaveAttribute("aria-pressed", "false")
  })

  test("options can have a label different from their value", async () => {
    const onChange = mock()
    const { user } = renderApp(<SegmentedControl options={[{ value: "interest_only", label: "Interest-only" }, { value: "linear", label: "Linear" }]} value="linear" onChange={onChange} />)
    await user.click(screen.getByRole("button", { name: "Interest-only" }))
    expect(onChange).toHaveBeenCalledWith("interest_only")
  })

  test("buttons never submit an enclosing form", async () => {
    const onSubmit = mock((e: { preventDefault: () => void }) => e.preventDefault())
    const { user } = renderApp(<form onSubmit={onSubmit}><Harness options={["a", "b"]} /></form>)
    await user.click(screen.getByRole("button", { name: "b" }))
    expect(onSubmit).not.toHaveBeenCalled()
  })
})

describe("ConfirmButton", () => {
  test("with a prompt: Label → prompt with Yes/No; Yes confirms", async () => {
    const onConfirm = mock()
    const { user } = renderApp(<ConfirmButton label="Delete thing" prompt="Delete thing?" onConfirm={onConfirm} />)
    await user.click(screen.getByRole("button", { name: "Delete thing" }))
    expect(screen.getByText("Delete thing?")).toBeInTheDocument()
    expect(onConfirm).not.toHaveBeenCalled()
    await user.click(screen.getByRole("button", { name: "Yes" }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  test("without a prompt the confirm button reads 'Sure?'", async () => {
    const onConfirm = mock()
    const { user } = renderApp(<ConfirmButton label="Delete" onConfirm={onConfirm} />)
    await user.click(screen.getByRole("button", { name: "Delete" }))
    await user.click(screen.getByRole("button", { name: "Sure?" }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  test("No backs out without confirming, and the action can be started again", async () => {
    const onConfirm = mock()
    const { user } = renderApp(<ConfirmButton label="Delete" onConfirm={onConfirm} />)
    await user.click(screen.getByRole("button", { name: "Delete" }))
    await user.click(screen.getByRole("button", { name: "No" }))
    expect(onConfirm).not.toHaveBeenCalled()
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument()
  })

  test("onStart runs when the confirmation begins; disabled blocks it", async () => {
    const onStart = mock()
    const { user } = renderApp(<><ConfirmButton label="A" onStart={onStart} onConfirm={() => {}} /><ConfirmButton label="B" disabled onConfirm={() => {}} /></>)
    await user.click(screen.getByRole("button", { name: "A" }))
    expect(onStart).toHaveBeenCalledTimes(1)
    expect(screen.getByRole("button", { name: "B" })).toBeDisabled()
  })
})

describe("badges and states", () => {
  test("RoleBadge shows the role, editor styled differently from viewer", () => {
    renderApp(<><RoleBadge role="editor" /><RoleBadge role="viewer" /></>)
    expect(screen.getByText("editor").className).toContain("indigo")
    expect(screen.getByText("viewer").className).not.toContain("indigo")
  })

  test("Badge adds its classes", () => {
    renderApp(<Badge className="bg-red-100">x</Badge>)
    expect(screen.getByText("x").className).toContain("bg-red-100")
  })

  test("LoadingText defaults to 'Loading…' but can say something else", () => {
    renderApp(<><LoadingText /><LoadingText>Loading portfolio…</LoadingText></>)
    expect(screen.getByText("Loading…")).toBeInTheDocument()
    expect(screen.getByText("Loading portfolio…")).toBeInTheDocument()
  })

  test("ErrorText renders an Error's message, a string, or nothing", () => {
    const { rerender } = renderApp(<ErrorText error={new Error("boom")} />)
    expect(screen.getByText("boom")).toBeInTheDocument()
    rerender(<ErrorText error="plain" />)
    expect(screen.getByText("plain")).toBeInTheDocument()
    rerender(<ErrorText error={null} />)
    expect(screen.queryByText("plain")).not.toBeInTheDocument()
  })

  test("EmptyState shows title, hint and children", () => {
    renderApp(<EmptyState title="Nothing yet" hint="Add one"><button>Go</button></EmptyState>)
    expect(screen.getByText("Nothing yet")).toBeInTheDocument()
    expect(screen.getByText("Add one")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Go" })).toBeInTheDocument()
  })
})
