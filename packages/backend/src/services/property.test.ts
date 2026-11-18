import { describe, expect, test } from "bun:test"
import { currentValueOf } from "./property"

const v = (valuationDate: string, value: string) => ({ valuationDate, value })
const none = { price: null, date: null }

describe("currentValueOf", () => {
  test("the latest valuation counts, flat until the next one", () => {
    const vals = [v("2022-01-01", "400000"), v("2024-06-01", "500000"), v("2023-03-01", "450000")]
    expect(currentValueOf(vals, none, "2024-05-31")).toEqual({ value: 450000, date: "2023-03-01" })
    expect(currentValueOf(vals, none, "2024-06-01")).toEqual({ value: 500000, date: "2024-06-01" }) // the day itself counts
    expect(currentValueOf(vals, none, "2030-01-01")).toEqual({ value: 500000, date: "2024-06-01" }) // flat: no extrapolation
  })

  test("valuations dated in the future are ignored until their day", () => {
    expect(currentValueOf([v("2022-01-01", "400000"), v("2099-01-01", "900000")], none, "2024-01-01")).toEqual({ value: 400000, date: "2022-01-01" })
  })

  test("on the same date the one entered last wins", () => {
    expect(currentValueOf([v("2024-01-01", "100"), v("2024-01-01", "200")], none, "2024-02-01").value).toBe(200)
  })

  test("without a valuation the purchase price counts once bought, else unknown", () => {
    expect(currentValueOf([], { price: "350000", date: "2020-05-01" }, "2024-01-01")).toEqual({ value: 350000, date: "2020-05-01" })
    expect(currentValueOf([], { price: "350000", date: null }, "2024-01-01")).toEqual({ value: 350000, date: null })
    expect(currentValueOf([], { price: "350000", date: "2030-01-01" }, "2024-01-01")).toEqual({ value: null, date: null }) // not bought yet
    expect(currentValueOf([], none, "2024-01-01")).toEqual({ value: null, date: null })
  })

  test("a valuation beats the purchase price, even an older one", () => {
    expect(currentValueOf([v("2021-01-01", "360000")], { price: "350000", date: "2020-05-01" }, "2024-01-01").value).toBe(360000)
  })

  test("only future valuations and a purchase price: the purchase price", () => {
    expect(currentValueOf([v("2099-01-01", "900000")], { price: "350000", date: "2020-05-01" }, "2024-01-01").value).toBe(350000)
  })
})
