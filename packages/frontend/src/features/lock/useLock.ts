import { useMutation } from "@tanstack/vue-query"
import { lockApp, useInvalidate } from "../../api"

/** Locks the standalone app: the unlock screen replaces everything and no data stays in memory. */
export function useLockApp() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: lockApp,
    onSuccess: (status) => {
      invalidate.forgetAll()
      invalidate.lockStatus(status)
    },
  })
}
