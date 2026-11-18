import { afterEach, describe, expect, test } from "vitest"
import { createApp, defineComponent, h, nextTick } from "vue"
import { mockApi } from "../../test/fakeApi"
import { runComposable } from "../../test/render"
import { http, setTokenGetter } from "../api/client"
import { authPlugin, createFakeAuth, useAuth } from "./auth"

afterEach(() => setTokenGetter(() => undefined)) // module-level state: don't leak a token into other tests

describe("createFakeAuth", () => {
  test("is a signed-in dev user by default", () => {
    const auth = createFakeAuth()
    expect(auth.isAuthenticated).toBe(true)
    expect(auth.isLoading).toBe(false)
    expect(auth.error).toBeNull()
    expect(auth.user?.profile).toMatchObject({ sub: "dev-user", email: "dev@localhost" })
  })

  test("can be any user, or nobody", () => {
    expect(createFakeAuth({ token: "t", user: { access_token: "t", profile: { email: "x@y.nl" } } }).user?.profile.email).toBe("x@y.nl")
    const nobody = createFakeAuth({ user: null })
    expect(nobody.isAuthenticated).toBe(false)
    expect(nobody.user).toBeNull()
  })

  test("sign-in/out can be observed", async () => {
    let out = 0
    const auth = createFakeAuth({ signoutRedirect: async () => void out++ })
    await auth.signoutRedirect()
    expect(out).toBe(1)
  })

  test("isAuthenticated follows the user reactively", () => {
    const auth = createFakeAuth()
    auth.user = null
    expect(auth.isAuthenticated).toBe(false)
  })

  test("resolves `ready` immediately", async () => {
    await expect(createFakeAuth().ready).resolves.toBeUndefined()
  })
})

describe("API token", () => {
  test("API requests carry the signed-in user's access token", async () => {
    const api = mockApi({ "GET /ping": {} })
    createFakeAuth({ token: "token-1" })
    await http.get("/ping")
    expect(api.calls()[0].headers.get("Authorization")).toBe("Bearer token-1")
  })

  test("a renewed token is used immediately (the getter reads the live session)", async () => {
    const api = mockApi({ "GET /ping": {} })
    const auth = createFakeAuth({ token: "old-token" })
    await http.get("/ping")
    auth.user = { access_token: "new-token", profile: {} }
    await http.get("/ping")
    expect(api.calls().map((c) => c.headers.get("Authorization"))).toEqual(["Bearer old-token", "Bearer new-token"])
  })

  test("after sign-out requests go out without a token", async () => {
    const api = mockApi({ "GET /ping": {} })
    const auth = createFakeAuth({ token: "t" })
    auth.user = null
    await http.get("/ping")
    expect(api.calls()[0].headers.has("Authorization")).toBe(false)
  })

  test("the token is in place before any component renders, so a child's first request is authenticated", async () => {
    const api = mockApi({ "GET /ping": {} })
    const auth = createFakeAuth({ token: "early" })
    const Child = defineComponent({ setup() { void http.get("/ping"); return () => h("span") } })
    const app = createApp(Child).use(authPlugin(auth))
    app.mount(document.createElement("div"))
    await nextTick()
    await new Promise((r) => setTimeout(r, 20))
    expect(api.calls()[0].headers.get("Authorization")).toBe("Bearer early")
  })
})

describe("useAuth", () => {
  test("gives a component the installed session", async () => {
    const auth = createFakeAuth({ user: { access_token: "t", profile: { email: "me@x.nl" } } })
    const { result } = await runComposable(() => useAuth(), { auth })
    expect(result.user?.profile.email).toBe("me@x.nl")
  })

  test("throws a clear error when nothing was installed", () => {
    const Child = defineComponent({ setup() { useAuth(); return () => h("span") } })
    expect(() => createApp(Child).mount(document.createElement("div"))).toThrow(/needs an auth/)
  })
})
