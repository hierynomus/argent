/**
 * Where PGlite finds its WebAssembly files and where the SQL migrations are. In development and in the
 * container both are read from node_modules / the `drizzle/` folder. In the standalone single-file
 * executable neither exists on disk, so its entry point registers the embedded copies here before the
 * database module is first imported (see `standalone/main.ts`).
 */
export interface PgliteAssets {
  /** the compiled pglite.wasm (the Postgres server) */
  pgliteWasmModule: WebAssembly.Module
  /** the compiled initdb.wasm (creates a fresh data directory) */
  initdbWasmModule: WebAssembly.Module
  /** pglite.data: the file system the server starts from */
  fsBundle: Blob
  /** a directory holding the extracted drizzle migrations */
  migrationsFolder: string
}

const slot = globalThis as { __argentPgliteAssets?: PgliteAssets }

export const registerPgliteAssets = (assets: PgliteAssets) => {
  slot.__argentPgliteAssets = assets
}
export const getPgliteAssets = (): PgliteAssets | undefined => slot.__argentPgliteAssets
