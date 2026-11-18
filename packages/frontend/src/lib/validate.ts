import { ref } from "vue"
import type { z } from "zod"

/** Messages by form field (the schema's top-level property name). `_form` holds errors not tied to a field. */
export type FieldErrors = Record<string, string>

export type ValidationResult<T> = { ok: true; data: T } | { ok: false; errors: FieldErrors }

/**
 * Validates form values against one of the request schemas from `@argent/shared` — the very same
 * schemas the backend enforces — so the user sees the server's rules and messages immediately.
 * Only the first message per field is kept.
 */
export function validate<S extends z.ZodType>(schema: S, value: unknown): ValidationResult<z.output<S>> {
  const result = schema.safeParse(value)
  if (result.success) return { ok: true, data: result.data }
  const errors: FieldErrors = {}
  for (const issue of result.error.issues) {
    const key = issue.path.length > 0 ? String(issue.path[0]) : "_form"
    if (!(key in errors)) errors[key] = issue.message
  }
  return { ok: false, errors }
}

/**
 * Form-level validation state.
 *
 *   const { errors, check } = useFormErrors()
 *   function submit() { if (!check(schema, body)) return; save.mutate() }
 *   <Field label="Name" :error="errors.name">…</Field>
 */
export function useFormErrors() {
  const errors = ref<FieldErrors>({})
  return {
    errors,
    /** Validates and stores the errors; returns true when the values are valid. */
    check<S extends z.ZodType>(schema: S, value: unknown): boolean {
      const result = validate(schema, value)
      errors.value = result.ok ? {} : result.errors
      return result.ok
    },
    clear: () => {
      errors.value = {}
    },
  }
}
