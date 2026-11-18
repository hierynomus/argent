// Force an isolated in-memory PGlite database for every test run, regardless of
// the developer's shell environment (never touch a real DATABASE_URL).
process.env.DATABASE_URL = "memory"
process.env.AUTH_MODE = "fake"

// No test may reach the real network: price providers are answered by a fake.
await import("./fakeFetch")
