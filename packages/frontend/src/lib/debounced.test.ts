import { afterEach, describe, expect, test, vi } from "vitest"
import { ref } from "vue"
import { runComposable } from "../../test/render"
import { useDebounced } from "./debounced"

describe("useDebounced", () => {
  afterEach(() => vi.useRealTimers())

  test("follows the source only after it has been quiet for the delay", async () => {
    const source = ref("a")
    const { result: settled } = await runComposable(() => useDebounced(source, 300))
    expect(settled.value).toBe("a")
    vi.useFakeTimers()
    source.value = "ab"
    await vi.advanceTimersByTimeAsync(200)
    source.value = "abc" // typing on restarts the wait
    await vi.advanceTimersByTimeAsync(200)
    expect(settled.value).toBe("a")
    await vi.advanceTimersByTimeAsync(150)
    expect(settled.value).toBe("abc")
  })

  test("an object that did not change (same content) does not restart anything", async () => {
    const source = ref<{ n: number } | null>(null)
    const { result: settled } = await runComposable(() => useDebounced(source, 100))
    vi.useFakeTimers()
    source.value = { n: 1 }
    await vi.advanceTimersByTimeAsync(150)
    expect(settled.value).toEqual({ n: 1 })
    const first = settled.value
    source.value = { n: 1 }
    await vi.advanceTimersByTimeAsync(150)
    expect(settled.value).toBe(first)
  })
})
