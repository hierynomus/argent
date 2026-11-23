import { describe, expect, test } from "bun:test"
import { resolveAppDirs } from "./appPaths"

const home = "/home/me"

describe("resolveAppDirs", () => {
  test("Linux follows the XDG directories, with their defaults", () => {
    expect(resolveAppDirs({ env: {}, platform: "linux", home })).toEqual({ configDir: "/home/me/.config/argent", dataDir: "/home/me/.local/share/argent" })
    expect(resolveAppDirs({ env: { XDG_CONFIG_HOME: "/x/c", XDG_DATA_HOME: "/x/d" }, platform: "linux", home })).toEqual({ configDir: "/x/c/argent", dataDir: "/x/d/argent" })
    expect(resolveAppDirs({ env: { XDG_CONFIG_HOME: "", XDG_DATA_HOME: " " }, platform: "linux", home }).dataDir).toBe("/home/me/.local/share/argent")
  })

  test("macOS keeps its data in Application Support and its config in ~/.config/argent", () => {
    expect(resolveAppDirs({ env: {}, platform: "darwin", home })).toEqual({ configDir: "/home/me/.config/argent", dataDir: "/home/me/Library/Application Support/Argent" })
  })

  test("Windows uses AppData", () => {
    const dirs = resolveAppDirs({ env: { APPDATA: "C:\\Users\\me\\AppData\\Roaming", LOCALAPPDATA: "C:\\Users\\me\\AppData\\Local" }, platform: "win32", home: "C:\\Users\\me" })
    expect(dirs.configDir.endsWith("Argent")).toBe(true)
    expect(dirs.configDir).toContain("Roaming")
    expect(dirs.dataDir).toContain("Local")
  })

  test("ARGENT_CONFIG_DIR and ARGENT_DATA_DIR win on every platform", () => {
    for (const platform of ["linux", "darwin", "win32"] as const) {
      expect(resolveAppDirs({ env: { ARGENT_CONFIG_DIR: "/c", ARGENT_DATA_DIR: "/d" }, platform, home })).toEqual({ configDir: "/c", dataDir: "/d" })
    }
  })
})
