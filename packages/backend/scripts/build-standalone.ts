/**
 * Builds the standalone executable: API + web app + embedded Postgres (PGlite) in one file.
 *
 *   bun run build:standalone [--target bun-linux-x64|bun-linux-arm64|bun-darwin-x64|bun-darwin-arm64|bun-windows-x64] [--outfile dist/argent]
 *
 * Needs the web app built first (`bun run --cwd packages/frontend build`). The files are embedded through a
 * generated entry point (`.build/entry.ts`), so nothing generated is committed.
 */
import { mkdirSync, readdirSync, statSync, writeFileSync } from "fs"
import { dirname, join, relative } from "path"

const root = join(import.meta.dir, "..")
const webDir = join(root, "../frontend/dist")
const migrationsDir = join(root, "drizzle")
const buildDir = join(root, ".build")

const arg = (name: string) => {
  const i = process.argv.indexOf(name)
  return i >= 0 ? process.argv[i + 1] : undefined
}
const target = arg("--target")
const outfile = arg("--outfile") ?? join(root, "dist", target?.includes("windows") ? "argent.exe" : "argent")

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    return statSync(p).isDirectory() ? walk(p) : [p]
  })
}

try {
  statSync(join(webDir, "index.html"))
} catch {
  console.error(`${webDir}/index.html is missing: run "bun run --cwd packages/frontend build" first.`)
  process.exit(1)
}

const pgliteDist = dirname(Bun.fileURLToPath(import.meta.resolve("@electric-sql/pglite")))
const imports: string[] = []
const spec = (file: string) => JSON.stringify(relative(buildDir, file).split("\\").join("/"))
let n = 0
const embed = (file: string) => {
  const name = `f${n++}`
  imports.push(`import ${name} from ${spec(file)} with { type: "file" }`)
  return name
}

const web = walk(webDir).map((f) => `  ${JSON.stringify("/" + relative(webDir, f).split("\\").join("/"))}: ${embed(f)},`)
const migrations = walk(migrationsDir)
  .filter((f) => f.endsWith(".sql") || f.endsWith(".json"))
  .map((f) => `  ${JSON.stringify(relative(migrationsDir, f).split("\\").join("/"))}: ${embed(f)},`)

const pgliteWasm = embed(join(pgliteDist, "pglite.wasm"))
const initdbWasm = embed(join(pgliteDist, "initdb.wasm"))
const pgliteData = embed(join(pgliteDist, "pglite.data"))

mkdirSync(buildDir, { recursive: true })
const entry = join(buildDir, "entry.ts")
writeFileSync(
  entry,
  `${imports.join("\n")}
import { runStandalone } from "../src/standalone/main"
import { embeddedSource } from "../src/standalone/static"

const web = {
${web.join("\n")}
}
const migrations = {
${migrations.join("\n")}
}
await runStandalone(embeddedSource(web), {
  web: embeddedSource(web),
  pgliteWasm: ${pgliteWasm},
  initdbWasm: ${initdbWasm},
  pgliteData: ${pgliteData},
  migrations,
}).catch((err) => {
  console.error(\`Argent could not start: \${(err as Error).message}\`)
  process.exit(1)
})
`,
)

mkdirSync(dirname(outfile), { recursive: true })
const proc = Bun.spawn(["bun", "build", "--compile", ...(target ? [`--target=${target}`] : []), "--minify", `--outfile=${outfile}`, entry], { stdout: "inherit", stderr: "inherit", cwd: root })
if ((await proc.exited) !== 0) process.exit(1)
console.log(`built ${outfile}`)
