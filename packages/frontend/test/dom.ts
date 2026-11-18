import { screen } from "@testing-library/react"

/**
 * Finds a form control by its visible label text. Works whether the label is wired up with
 * `htmlFor` or simply sits next to its control inside the same wrapper (as in older markup).
 */
export function field(label: string | RegExp, root: HTMLElement = document.body): HTMLInputElement | HTMLSelectElement {
  const labels = Array.from(root.querySelectorAll("label")).filter((l) =>
    typeof label === "string" ? l.textContent?.trim() === label : label.test(l.textContent ?? ""),
  )
  if (labels.length === 0) throw new Error(`No label matching ${label}`)
  const l = labels[0] as HTMLLabelElement
  const control = (l.htmlFor && root.ownerDocument.getElementById(l.htmlFor)) || l.parentElement?.querySelector("input,select,textarea")
  if (!control) throw new Error(`Label ${label} has no control`)
  return control as HTMLInputElement | HTMLSelectElement
}

export { screen }
