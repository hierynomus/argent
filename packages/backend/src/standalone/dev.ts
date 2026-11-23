import { join } from "path"
import { runStandalone } from "./main"
import { dirSource } from "./static"

// Run the standalone app from source against the built web app (`bun run build` in packages/frontend first):
//   bun run --cwd packages/backend start:local
const web = dirSource(process.env.ARGENT_WEB_DIR || join(import.meta.dir, "../../../frontend/dist"))
await runStandalone(web).catch((err) => {
  console.error(`Argent could not start: ${(err as Error).message}`)
  process.exit(1)
})
