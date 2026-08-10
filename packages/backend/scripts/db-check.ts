// Fails if schema.ts has changes that aren't captured in a committed migration.
// Run before pushing, or wire into a pre-commit/CI hook.
const backendDir = new URL("..", import.meta.url).pathname

const proc = Bun.spawnSync(["bun", "x", "drizzle-kit", "generate"], {
  cwd: backendDir,
  stdout: "pipe",
  stderr: "pipe",
})

const output = proc.stdout.toString() + proc.stderr.toString()
process.stdout.write(output)

if (!output.includes("No schema changes")) {
  console.error(
    "\n✖ schema.ts has changes not yet captured in a migration.\n" +
    "  Review the newly generated file(s) under packages/backend/drizzle/, then commit them.",
  )
  process.exit(1)
}

console.log("✓ Migrations are in sync with schema.ts")
