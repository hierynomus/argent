import { randomBytes, scrypt, timingSafeEqual } from "crypto"

/**
 * The password that unlocks the standalone app. Only a salted scrypt hash is kept (in config.json), sessions live in
 * memory only: closing the app locks it. The password protects the app and its API on this computer; it does not
 * encrypt the database files on disk.
 */
export interface LocalLock {
  isSet(): boolean
  /** A new session token when the password is right; "wait" (with seconds) after too many wrong guesses. */
  unlock(password: string): Promise<{ token: string } | { wait: number } | null>
  isUnlocked(token: string | undefined): boolean
  lock(token: string | undefined): void
  /** Sets or changes the password (changing needs the current one) and returns a session for the caller. */
  setPassword(password: string, current?: string): Promise<{ token: string } | "wrong-password" | { wait: number }>
  /** Removes the password (needs the current one). */
  removePassword(current: string): Promise<true | "wrong-password" | { wait: number }>
}

const KEY_LENGTH = 32
const N = 16384
const MAX_FAILURES = 5
const WAIT_SECONDS = 30

const derive = (password: string, salt: Buffer): Promise<Buffer> =>
  new Promise((resolve, reject) => scrypt(password, salt, KEY_LENGTH, { N }, (err, key) => (err ? reject(err) : resolve(key))))

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  return `scrypt$${N}$${salt.toString("base64")}$${(await derive(password, salt)).toString("base64")}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [kind, n, salt, hash] = stored.split("$")
  if (kind !== "scrypt" || Number(n) !== N || !salt || !hash) return false
  const expected = Buffer.from(hash, "base64")
  const actual = await derive(password, Buffer.from(salt, "base64"))
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}

export function createLocalLock({
  hash,
  save,
  now = () => Date.now(),
}: {
  /** the stored hash, if a password is set */
  hash?: string
  /** persists the hash (undefined = no password any more) */
  save: (hash: string | undefined) => void
  now?: () => number
}): LocalLock {
  let current = hash
  const sessions = new Set<string>()
  let failures = 0
  let blockedUntil = 0

  const newSession = () => {
    const token = randomBytes(32).toString("base64url")
    sessions.add(token)
    return token
  }
  const wait = () => (now() < blockedUntil ? Math.ceil((blockedUntil - now()) / 1000) : 0)
  // one counter for every guess, wherever it is made: there is one person and one password
  async function check(password: string): Promise<boolean | { wait: number }> {
    if (!current) return true
    const w = wait()
    if (w > 0) return { wait: w }
    if (await verifyPassword(password, current)) {
      failures = 0
      return true
    }
    if (++failures >= MAX_FAILURES) {
      failures = 0
      blockedUntil = now() + WAIT_SECONDS * 1000
    }
    return false
  }

  return {
    isSet: () => current !== undefined,

    async unlock(password) {
      const ok = await check(password)
      if (typeof ok === "object") return ok
      return ok ? { token: newSession() } : null
    },

    isUnlocked: (token) => current === undefined || (token !== undefined && sessions.has(token)),

    lock(token) {
      if (token) sessions.delete(token)
    },

    async setPassword(password, currentPassword) {
      const ok = await check(currentPassword ?? "")
      if (typeof ok === "object") return ok
      if (!ok) return "wrong-password"
      current = await hashPassword(password)
      save(current)
      sessions.clear() // everyone else has to unlock again with the new password
      return { token: newSession() }
    },

    async removePassword(currentPassword) {
      const ok = await check(currentPassword)
      if (typeof ok === "object") return ok
      if (!ok) return "wrong-password"
      current = undefined
      save(undefined)
      sessions.clear()
      return true
    },
  }
}
