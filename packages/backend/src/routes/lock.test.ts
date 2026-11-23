import { describe, expect, test } from "bun:test"
import { createApp } from "../app"
import { createLocalLock, hashPassword } from "../services/localLock"

function setup(hash?: string, now = () => Date.now()) {
  const saved: (string | undefined)[] = []
  const lock = createLocalLock({ hash, save: (h) => saved.push(h), now })
  const app = createApp({ lock })
  let cookie = ""
  const call = async (method: string, path: string, body?: unknown) => {
    const res = await app.request(`/api${path}`, {
      method,
      headers: { "Content-Type": "application/json", ...(cookie ? { cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const set = res.headers.get("set-cookie")
    if (set) cookie = set.startsWith("argent_session=;") || /Max-Age=0|Expires=Thu, 01 Jan 1970/i.test(set) ? "" : set.split(";")[0]!
    const text = await res.text()
    return { status: res.status, body: text ? JSON.parse(text) : null, res }
  }
  return { call, saved, lock, forgetCookie: () => (cookie = "") }
}

describe("the app password", () => {
  test("without a password everything is open", async () => {
    const { call } = setup()
    expect((await call("GET", "/local/auth/status")).body).toEqual({ passwordSet: false, unlocked: true })
    expect((await call("GET", "/accounts")).status).toBe(200)
  })

  test("with a password the API is closed until unlocked, and the cookie is HttpOnly and SameSite=Strict", async () => {
    const { call } = setup(await hashPassword("correct horse"))
    expect((await call("GET", "/accounts")).status).toBe(401)
    expect((await call("GET", "/accounts")).body).toMatchObject({ locked: true })
    expect((await call("GET", "/local/auth/status")).body).toEqual({ passwordSet: true, unlocked: false })
    expect((await call("POST", "/local/auth/unlock", { password: "nope" })).status).toBe(401)
    expect((await call("GET", "/accounts")).status).toBe(401)

    const ok = await call("POST", "/local/auth/unlock", { password: "correct horse" })
    expect(ok.status).toBe(200)
    const cookie = ok.res.headers.get("set-cookie")!
    expect(cookie).toMatch(/HttpOnly/i)
    expect(cookie).toMatch(/SameSite=Strict/i)
    expect((await call("GET", "/accounts")).status).toBe(200)

    await call("POST", "/local/auth/lock")
    expect((await call("GET", "/accounts")).status).toBe(401)
  })

  test("another client without the cookie stays locked", async () => {
    const a = setup(await hashPassword("secret-pass"))
    await a.call("POST", "/local/auth/unlock", { password: "secret-pass" })
    a.forgetCookie()
    expect((await a.call("GET", "/transactions")).status).toBe(401)
    expect((await a.call("GET", "/admin/backup")).status).toBe(401)
  })

  test("five wrong passwords block guessing for a while, even with the right one", async () => {
    let t = 1_000_000
    const { call } = setup(await hashPassword("secret-pass"), () => t)
    for (let i = 0; i < 5; i++) expect((await call("POST", "/local/auth/unlock", { password: "bad" })).status).toBe(401)
    const blocked = await call("POST", "/local/auth/unlock", { password: "secret-pass" })
    expect(blocked.status).toBe(429)
    expect(blocked.res.headers.get("retry-after")).toBe("30")
    t += 31_000
    expect((await call("POST", "/local/auth/unlock", { password: "secret-pass" })).status).toBe(200)
  })

  test("a password can be set, is saved as a hash, and then locks everyone else out", async () => {
    const { call, saved, forgetCookie } = setup()
    expect((await call("PUT", "/local/auth/password", { password: "short" })).status).toBe(400)
    const set = await call("PUT", "/local/auth/password", { password: "a good password" })
    expect(set.status).toBe(200)
    expect(saved).toHaveLength(1)
    expect(saved[0]).toStartWith("scrypt$")
    expect(saved[0]).not.toContain("a good password")
    expect((await call("GET", "/accounts")).status).toBe(200) // the caller stays signed in
    forgetCookie()
    expect((await call("GET", "/accounts")).status).toBe(401)
  })

  test("changing or removing needs the current password", async () => {
    const { call, saved } = setup(await hashPassword("first password"))
    await call("POST", "/local/auth/unlock", { password: "first password" })
    expect((await call("PUT", "/local/auth/password", { password: "second password" })).status).toBe(403)
    expect((await call("PUT", "/local/auth/password", { password: "second password", currentPassword: "first password" })).status).toBe(200)
    expect((await call("POST", "/local/auth/password/remove", { currentPassword: "first password" })).status).toBe(403)
    expect((await call("POST", "/local/auth/password/remove", { currentPassword: "second password" })).status).toBe(200)
    expect(saved.at(-1)).toBeUndefined()
    expect((await call("GET", "/local/auth/status")).body).toEqual({ passwordSet: false, unlocked: true })
  })

  test("setting a password needs an unlocked session", async () => {
    const { call } = setup(await hashPassword("first password"))
    expect((await call("PUT", "/local/auth/password", { password: "attacker pass", currentPassword: "first password" })).status).toBe(401)
  })
})
