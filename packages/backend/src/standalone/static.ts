import { join, normalize, sep } from "path"
import { existsSync, statSync } from "fs"

/** Where the built web app comes from: a directory (`bun run start:local`) or files embedded in the executable. */
export interface AssetSource {
  /** a file of the web app by URL path (`/assets/x.js`), or null */
  file(path: string): ReturnType<typeof Bun.file> | null
}

export function dirSource(root: string): AssetSource {
  return {
    file(path) {
      const target = normalize(join(root, path))
      if (target !== root && !target.startsWith(root + sep)) return null // path traversal
      return existsSync(target) && statSync(target).isFile() ? Bun.file(target) : null
    },
  }
}

/** `map`: URL path → the embedded file (see scripts/build-standalone.ts). */
export function embeddedSource(map: Record<string, string>): AssetSource {
  return { file: (path) => (path in map ? Bun.file(map[path]!) : null) }
}

const IMMUTABLE = "public, max-age=31536000, immutable"

/**
 * The web app as an HTTP handler, like nginx does in the container: hashed `/assets/*` are cached for
 * good, everything else is never cached, an unknown path is the single-page app's `index.html`, and
 * `/env-config.js` tells the SPA to skip the login (there is none locally).
 */
export function spaHandler(source: AssetSource, runtimeEnv: Record<string, string>) {
  const headers = { "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer", "X-Frame-Options": "DENY" }
  return async (path: string): Promise<Response | null> => {
    if (path === "/env-config.js") {
      return new Response(`window.__ENV__ = ${JSON.stringify(runtimeEnv)};\n`, { headers: { ...headers, "Content-Type": "text/javascript", "Cache-Control": "no-store" } })
    }
    const file = source.file(path === "/" ? "/index.html" : path)
    if (file) return new Response(file, { headers: { ...headers, "Cache-Control": path.startsWith("/assets/") ? IMMUTABLE : "no-cache" } })
    // a missing asset is a 404, not the app; any other path is a client-side route
    if (path.startsWith("/assets/") || /\.[a-z0-9]+$/i.test(path)) return null
    const index = source.file("/index.html")
    return index ? new Response(index, { headers: { ...headers, "Cache-Control": "no-cache" } }) : null
  }
}
