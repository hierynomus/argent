import { inject, onBeforeUnmount, provide, useAttrs, watchEffect, type InjectionKey, type Ref } from "vue"

/** What a `Field` tells the control inside it: the id to use, and whether/where its error is shown. */
export interface FieldContext {
  id: Ref<string>
  invalid: () => boolean
  errorId: Ref<string>
  /** a control with its own explicit `id` registers it, so the label points at the right element */
  setCustomId: (id: string | undefined) => void
}

const KEY: InjectionKey<FieldContext> = Symbol("field")

export const provideField = (ctx: FieldContext) => provide(KEY, ctx)

/**
 * For controls (Input, Select): the surrounding Field's context, if any. Also keeps the Field's label
 * in sync when the control was given an explicit `id`.
 */
export function useField() {
  const field = inject(KEY, null)
  const attrs = useAttrs()
  if (field) {
    watchEffect(() => field.setCustomId(attrs.id ? String(attrs.id) : undefined))
    onBeforeUnmount(() => field.setCustomId(undefined))
  }
  return field
}
