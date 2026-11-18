import { afterEach, describe, expect, spyOn, test } from "bun:test"
import { db } from "../db"
import { forgetSyncedProfiles, syncProfileOnce } from "./auth"
import { unique } from "../../test/helpers"

afterEach(() => forgetSyncedProfiles())
const tick = () => new Promise((r) => setTimeout(r, 20))

/** `db.insert(...).values(...).onConflictDoUpdate(...)` as a chain whose last step fails. */
const failingInsert = (message: string) => ({ values: () => ({ onConflictDoUpdate: () => Promise.reject(new Error(message)) }) }) as never

describe("syncProfileOnce", () => {
  test("stores the profile once per session", async () => {
    const sub = unique("sync")
    const insert = spyOn(db, "insert")
    syncProfileOnce(sub, "a@x.nl", "A", 100)
    syncProfileOnce(sub, "a@x.nl", "A", 100) // same session: no second write
    await tick()
    expect(insert).toHaveBeenCalledTimes(1)
    syncProfileOnce(sub, "a@x.nl", "A", 200) // a new login (new iat)
    await tick()
    expect(insert).toHaveBeenCalledTimes(2)
    insert.mockRestore()
  })

  test("a failure is logged, and the next request of the session tries again", async () => {
    const sub = unique("sync")
    const errors: string[] = []
    const log = spyOn(console, "error").mockImplementation((msg: unknown) => void errors.push(String(msg)))
    const insert = spyOn(db, "insert").mockImplementationOnce(() => failingInsert("connection reset"))
    syncProfileOnce(sub, "a@x.nl", "A", 100)
    await tick()
    expect(errors.join("\n")).toContain(`could not sync the profile of ${sub}`)
    expect(errors.join("\n")).toContain("connection reset")

    insert.mockRestore() // the database is back
    const retry = spyOn(db, "insert")
    syncProfileOnce(sub, "a@x.nl", "A", 100) // same session: it was not counted as done
    await tick()
    expect(retry).toHaveBeenCalledTimes(1)
    retry.mockRestore()
    log.mockRestore()
  })
})
