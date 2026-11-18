import { afterEach, describe, expect, test } from "bun:test"
import { AuthContext, type AuthContextProps } from "react-oidc-context"
import { render } from "@testing-library/react"
import { mockApi } from "../../test/fakeApi"
import { ApiAuthBridge } from "./AuthBridge"
import { http, setTokenGetter } from "./client"

/** An auth context with just enough in it for the bridge: a user with the given token. */
const ctx = (token: string | null): AuthContextProps => ({ user: token ? { access_token: token } : null } as unknown as AuthContextProps)

const tree = (token: string | null) => (
  <AuthContext.Provider value={ctx(token)}>
    <ApiAuthBridge>
      <span>child</span>
    </ApiAuthBridge>
  </AuthContext.Provider>
)

afterEach(() => setTokenGetter(() => undefined)) // module-level state: don't leak a token into other tests

describe("ApiAuthBridge", () => {
  test("renders its children", () => {
    const { getByText } = render(tree("t"))
    expect(getByText("child")).toBeInTheDocument()
  })

  test("API requests carry the signed-in user's access token", async () => {
    const api = mockApi({ "GET /ping": {} })
    render(tree("token-1"))
    await http.get("/ping")
    expect(api.calls()[0].headers.get("Authorization")).toBe("Bearer token-1")
  })

  test("a silently renewed token is picked up without remounting anything", async () => {
    const api = mockApi({ "GET /ping": {} })
    const { rerender } = render(tree("old-token"))
    await http.get("/ping")
    rerender(tree("new-token"))
    await http.get("/ping")
    expect(api.calls().map((c) => c.headers.get("Authorization"))).toEqual(["Bearer old-token", "Bearer new-token"])
  })

  test("when the user signs out, requests go out without a token", async () => {
    const api = mockApi({ "GET /ping": {} })
    const { rerender } = render(tree("t"))
    rerender(tree(null))
    await http.get("/ping")
    expect(api.calls()[0].headers.has("Authorization")).toBe(false)
  })

  test("the token is available to children on their very first request (installed during render, not in an effect)", async () => {
    const api = mockApi({ "GET /ping": {} })
    function Child() {
      // effects of children run before a parent's effects — the first request must still be authenticated
      useEffectOnce(() => { void http.get("/ping") })
      return null
    }
    render(
      <AuthContext.Provider value={ctx("early")}>
        <ApiAuthBridge><Child /></ApiAuthBridge>
      </AuthContext.Provider>,
    )
    await new Promise((r) => setTimeout(r, 20))
    expect(api.calls()[0].headers.get("Authorization")).toBe("Bearer early")
  })
})

import { useEffect } from "react"
function useEffectOnce(fn: () => void) { useEffect(fn, []) }
