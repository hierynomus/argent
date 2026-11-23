import { Hono } from "hono"
import { HTTPException } from "hono/http-exception"
import { localSettingsSchema } from "@argent/shared"
import { validateJson } from "../middleware/validate"
import { createBackup } from "../services/backup"
import type { LocalSettingsStore } from "../services/localSettings"

/**
 * Only mounted by the standalone app (`createApp({ local })`): its settings, and backups written to a folder
 * the user chose, because a desktop window has no download manager to ask where a file should go.
 */
export function localRoutes(store: LocalSettingsStore) {
  const app = new Hono()

  app.get("/settings", (c) => c.json(store.get()))

  app.put("/settings", validateJson(localSettingsSchema), (c) => {
    try {
      return c.json(store.setBackupDir(c.req.valid("json").backupDir))
    } catch (err) {
      throw new HTTPException(400, { message: (err as Error).message })
    }
  })

  app.post("/backup", async (c) => c.json(store.saveBackup(JSON.stringify(await createBackup(), null, 2))))

  return app
}
