import { onScopeDispose, ref, toValue, watch, type MaybeRefOrGetter, type Ref } from "vue"

/** A copy of `source` that follows it `ms` milliseconds after the last change (for requests made while typing). */
export function useDebounced<T>(source: MaybeRefOrGetter<T>, ms = 400): Ref<T> {
  const settled = ref(toValue(source)) as Ref<T>
  let timer: ReturnType<typeof setTimeout> | undefined
  watch(
    () => JSON.stringify(toValue(source)),
    () => {
      clearTimeout(timer)
      timer = setTimeout(() => (settled.value = toValue(source)), ms)
    },
  )
  onScopeDispose(() => clearTimeout(timer))
  return settled
}
