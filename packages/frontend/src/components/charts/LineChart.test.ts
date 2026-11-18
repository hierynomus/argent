import { describe, expect, test } from "vitest"
import { fireEvent, renderApp, screen } from "../../../test/render"
import LineChart from "./LineChart.vue"

const DAY = 86_400_000
const T0 = Date.UTC(2024, 0, 1)
const points = [100, 110, 90, 120, 130].map((v, i) => ({ t: T0 + i * DAY, v }))
const props = {
  points,
  formatValue: (v: number) => `€${v.toFixed(0)}`,
  formatDate: (t: number) => new Date(t).toISOString().slice(0, 10),
  label: "Test price, last year",
}
const chart = () => screen.getByRole("group")

describe("LineChart", () => {
  test("draws one line through every point, with value and date axes", async () => {
    await renderApp(LineChart, { props })
    const line = document.querySelector("svg path[stroke-width='2']")!
    expect(line.getAttribute("d")!.match(/[ML]/g)).toHaveLength(points.length)
    expect(screen.getByRole("img", { name: "Test price, last year" })).toBeInTheDocument()
    // five date ticks along the bottom, from the first to the last day
    expect(screen.getByText("2024-01-01")).toBeInTheDocument()
    expect(screen.getByText("2024-01-05")).toBeInTheDocument()
    // value ticks are formatted with the given formatter and bracket the data
    const ticks = [...document.querySelectorAll("svg text")].map((t) => t.textContent ?? "").filter((t) => t.startsWith("€"))
    expect(ticks).toHaveLength(5)
    const nums = ticks.map((t) => parseFloat(t.slice(1)))
    expect(Math.min(...nums)).toBeLessThanOrEqual(90)
    expect(Math.max(...nums)).toBeGreaterThanOrEqual(130)
  })

  test("has no tooltip until a point is inspected", async () => {
    await renderApp(LineChart, { props })
    expect(screen.queryByTestId("chart-tooltip")).not.toBeInTheDocument()
  })

  test("the arrow keys step through the values (shown in a tooltip and announced)", async () => {
    const { user } = await renderApp(LineChart, { props })
    chart().focus()
    await user.keyboard("{ArrowRight}")
    expect(screen.getByTestId("chart-tooltip")).toHaveTextContent("2024-01-01")
    expect(screen.getByTestId("chart-tooltip")).toHaveTextContent("€100")
    await user.keyboard("{ArrowRight}{ArrowRight}")
    expect(screen.getByTestId("chart-tooltip")).toHaveTextContent("€90")
    expect(document.querySelector("[aria-live]")!.textContent).toBe("2024-01-03: €90")
    await user.keyboard("{End}")
    expect(screen.getByTestId("chart-tooltip")).toHaveTextContent("€130")
    await user.keyboard("{ArrowRight}") // stays on the last point
    expect(screen.getByTestId("chart-tooltip")).toHaveTextContent("€130")
    await user.keyboard("{Home}")
    expect(screen.getByTestId("chart-tooltip")).toHaveTextContent("€100")
    await user.keyboard("{Escape}")
    expect(screen.queryByTestId("chart-tooltip")).not.toBeInTheDocument()
  })

  test("ArrowLeft from nowhere starts at the newest value", async () => {
    const { user } = await renderApp(LineChart, { props })
    chart().focus()
    await user.keyboard("{ArrowLeft}")
    expect(screen.getByTestId("chart-tooltip")).toHaveTextContent("€130")
  })

  test("pointing at the chart shows the nearest value, leaving hides it", async () => {
    await renderApp(LineChart, { props })
    const svg = document.querySelector("svg")!
    svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: 720, height: 260, right: 720, bottom: 260, x: 0, y: 0, toJSON: () => ({}) })
    // the plot spans x = 84 … 706 of 720 units: the right edge is the last point
    await fireEvent.pointerMove(svg, { clientX: 705 })
    expect(screen.getByTestId("chart-tooltip")).toHaveTextContent("€130")
    await fireEvent.pointerMove(svg, { clientX: 84 })
    expect(screen.getByTestId("chart-tooltip")).toHaveTextContent("€100")
    await fireEvent.pointerLeave(svg)
    expect(screen.queryByTestId("chart-tooltip")).not.toBeInTheDocument()
  })

  test("buy and sell markers are drawn with their label, markers outside the data range are skipped", async () => {
    await renderApp(LineChart, {
      props: {
        ...props,
        markers: [
          { t: T0 + DAY, v: 105, kind: "buy", label: "bought at 105" },
          { t: T0 + 3 * DAY, v: 118, kind: "sell", label: "sold at 118" },
          { t: T0 - 30 * DAY, v: 90, kind: "buy", label: "long before the data starts" },
        ],
      },
    })
    expect(screen.getAllByTestId("trade-marker")).toHaveLength(2)
    expect(document.body.textContent).toContain("bought at 105")
    expect(document.body.textContent).toContain("sold at 118")
    expect(document.body.textContent).not.toContain("long before")
  })

  test("a flat series still draws (no division by zero)", async () => {
    await renderApp(LineChart, { props: { ...props, points: [1, 2, 3].map((i) => ({ t: T0 + i * DAY, v: 50 })) } })
    expect(document.querySelector("svg path[stroke-width='2']")!.getAttribute("d")).not.toContain("NaN")
  })

  test("a single point is drawn in the middle", async () => {
    await renderApp(LineChart, { props: { ...props, points: [{ t: T0, v: 7 }] } })
    expect(document.querySelector("svg path[stroke-width='2']")!.getAttribute("d")).not.toContain("NaN")
  })

  test("a step line holds each value until the next date, then jumps", async () => {
    await renderApp(LineChart, { props: { ...props, step: true } })
    const d = document.querySelector("svg path[stroke-width='2']")!.getAttribute("d")!
    expect(d).toMatch(/^M[\d. ]+( H[\d.]+ V[\d.]+){4}$/) // M start, then H (to the next date) V (to the next value) per point
    expect(d).not.toContain("L")
  })
})
