import { cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from "react"
import { cx } from "./cx"

const LABEL = "block text-xs text-gray-500 dark:text-gray-400 mb-1"

/**
 * A labelled form control. The label is properly associated with the control (`htmlFor`/`id`),
 * so it is announced by screen readers and clicking it focuses the control. An `error` is shown
 * under the control and linked to it (`aria-invalid`, `aria-describedby`).
 *
 *   <Field label="Start date" error={errors.startDate}><Input type="date" … /></Field>
 */
export function Field({
  label,
  error,
  children,
  className,
}: {
  label: ReactNode
  error?: string
  /** exactly one control (Input, Select, …); it receives the generated `id` */
  children: ReactElement<{ id?: string; "aria-invalid"?: boolean; "aria-describedby"?: string }>
  className?: string
}) {
  const generated = useId()
  const id = isValidElement(children) && children.props.id ? children.props.id : generated
  const errorId = `${id}-error`
  return (
    <div className={className}>
      <label htmlFor={id} className={LABEL}>
        {label}
      </label>
      {cloneElement(children, error ? { id, "aria-invalid": true, "aria-describedby": errorId } : { id })}
      {error && (
        <p id={errorId} role="alert" className="text-xs text-red-600 dark:text-red-400 mt-1">
          {error}
        </p>
      )}
    </div>
  )
}

/** Like `Field`, for a control made of several buttons (e.g. a segmented toggle): labels the group instead. */
export function FieldGroup({ label, children, className }: { label: ReactNode; children: ReactNode; className?: string }) {
  const id = useId()
  return (
    <div className={className} role="group" aria-labelledby={id}>
      <span id={id} className={cx(LABEL)}>
        {label}
      </span>
      {children}
    </div>
  )
}
