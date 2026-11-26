import { describe, expect, test } from "vitest"
import { ref } from "vue"
import { renderTemplate, screen } from "../../../test/render"
import { Input } from "."

describe("date fields", () => {
  test("can be typed in, and day-first dates are tidied to ISO on leaving the field", async () => {
    const d = ref("")
    const { user } = await renderTemplate(
      `<div><Input v-model="d" type="date" aria-label="When" /><output aria-label="out">{{ d }}</output></div>`,
      { components: { Input }, setup: () => ({ d }) },
    )
    const input = screen.getByLabelText("When") as HTMLInputElement
    await user.type(input, "5-3-2026")
    await user.tab()
    expect(d.value).toBe("2026-03-05")
    expect(input.value).toBe("2026-03-05")
  })
})
