/**
 * Builds the Argent server as the Tauri "sidecar": `src-tauri/binaries/argent-server-<rust target triple>`.
 * Tauri picks the file by the triple of the platform it builds for. Pass `--triple <t>` to cross-build
 * (the web app must be built: `bun run --cwd packages/frontend build`).
 */
import { join } from "path"

const here = join(import.meta.dir, "..")
const backend = join(here, "../backend")

const BUN_TARGET: Record<string, string> = {
  "x86_64-unknown-linux-gnu": "bun-linux-x64",
  "aarch64-unknown-linux-gnu": "bun-linux-arm64",
  "x86_64-apple-darwin": "bun-darwin-x64",
  "aarch64-apple-darwin": "bun-darwin-arm64",
  "x86_64-pc-windows-msvc": "bun-windows-x64",
}

async function hostTriple(): Promise<string> {
  const out = await new Response(Bun.spawn(["rustc", "-vV"], { stdout: "pipe" }).stdout).text()
  const triple = /^host: (.+)$/m.exec(out)?.[1]
  if (!triple) throw new Error("cannot read the host triple from `rustc -vV`")
  return triple
}

const i = process.argv.indexOf("--triple")
const triple = (i >= 0 ? process.argv[i + 1] : undefined) ?? (await hostTriple())
const target = BUN_TARGET[triple]
if (!target) throw new Error(`no Bun build target for ${triple} (known: ${Object.keys(BUN_TARGET).join(", ")})`)

const outfile = join(here, "src-tauri/binaries", `argent-server-${triple}${triple.includes("windows") ? ".exe" : ""}`)
const proc = Bun.spawn(["bun", "run", "build:standalone", "--target", target, "--outfile", outfile], { cwd: backend, stdout: "inherit", stderr: "inherit" })
process.exit(await proc.exited)
