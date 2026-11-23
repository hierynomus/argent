import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs"
import { join } from "path"

export interface RunningInstance {
  pid: number
  url: string
}

const alive = (pid: number) => {
  try {
    process.kill(pid, 0)
    return true
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === "EPERM" // exists, but is not ours
  }
}

/**
 * Two Argent processes must never open the same embedded database. A lock file in the data directory
 * names the running instance; a stale one (the process is gone after a crash) is ignored.
 * Returns the running instance when there is one, or null after taking the lock.
 */
export function takeLock(dataDir: string, me: RunningInstance): RunningInstance | null {
  mkdirSync(dataDir, { recursive: true })
  const file = join(dataDir, "argent.lock")
  if (existsSync(file)) {
    try {
      const other = JSON.parse(readFileSync(file, "utf8")) as RunningInstance
      if (other.pid !== me.pid && alive(other.pid)) return other
    } catch {
      // unreadable: treat as stale
    }
  }
  writeFileSync(file, JSON.stringify(me))
  return null
}

export function releaseLock(dataDir: string, pid: number): void {
  const file = join(dataDir, "argent.lock")
  try {
    if ((JSON.parse(readFileSync(file, "utf8")) as RunningInstance).pid === pid) rmSync(file)
  } catch {
    // already gone
  }
}
