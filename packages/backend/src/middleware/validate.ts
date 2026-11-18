import { zValidator } from "@hono/zod-validator"
import type { z } from "zod"

/** Turns zod issues into a single readable sentence, e.g. "name is required; endDate must be after startDate". */
export function formatIssues(error: { issues: ReadonlyArray<{ message: string }> }): string {
  return error.issues.map((i) => i.message).join("; ")
}

/**
 * Validates the JSON request body against a schema from `@argent/shared`.
 *
 * On failure responds `400 { error: "<readable summary>", issues: [{ path, message }] }`
 * (`error` keeps the shape the frontend already surfaces). On success the parsed,
 * normalised value is available as `c.req.valid("json")`.
 */
export const validateJson = <T extends z.ZodType>(schema: T) => validated("json", schema)

/** Like `validateJson`, for the query string (`c.req.valid("query")`); same 400 shape. */
export const validateQuery = <T extends z.ZodType>(schema: T) => validated("query", schema)

function validated<Target extends "json" | "query", T extends z.ZodType>(target: Target, schema: T) {
  return zValidator(target, schema, (result, c) => {
    if (!result.success) {
      return c.json(
        {
          error: formatIssues(result.error),
          issues: result.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        },
        400,
      )
    }
  })
}
