/**
 * Talking to the desktop shell (Tauri). The page is served by the local Argent server, so there is no
 * bundled Tauri API: the shell injects `window.__TAURI_INTERNALS__`, and only the commands its capability
 * allows (see packages/desktop/src-tauri/capabilities/local-server.json) can be called.
 */
interface TauriInternals {
  invoke<T>(command: string, args?: Record<string, unknown>): Promise<T>
}
declare global {
  interface Window {
    __TAURI_INTERNALS__?: TauriInternals
  }
}

/** True inside the desktop app's window, false in a browser. */
export const isDesktopApp = (): boolean => typeof window.__TAURI_INTERNALS__?.invoke === "function"

/** The native "choose a folder" dialog, opened in `start`. Resolves to null when the user cancels. */
export async function pickFolder(start?: string): Promise<string | null> {
  const tauri = window.__TAURI_INTERNALS__
  if (!tauri) throw new Error("The folder picker is only available in the desktop app")
  return (await tauri.invoke<string | null>("pick_folder", { start: start ?? null })) ?? null
}
