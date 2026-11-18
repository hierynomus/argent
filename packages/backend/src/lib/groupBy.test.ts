import { describe, expect, test } from "bun:test"
import { groupBy } from "./groupBy"

describe("groupBy", () => {
  test("groups by key and keeps the original order inside each group", () => {
    const g = groupBy([{ k: "a", n: 1 }, { k: "b", n: 2 }, { k: "a", n: 3 }], (r) => r.k)
    expect(g.get("a")!.map((r) => r.n)).toEqual([1, 3])
    expect(g.get("b")!.map((r) => r.n)).toEqual([2])
    expect(g.get("c")).toBeUndefined()
  })
  test("an empty list gives no groups", () => expect(groupBy([], () => 1).size).toBe(0))
})
